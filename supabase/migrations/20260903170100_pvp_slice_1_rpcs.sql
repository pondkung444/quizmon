-- Migration: 20260903170100_pvp_slice_1_rpcs
-- ระบบ "ประลอง" (PvP) — สไลซ์ 1: RPC ทั้งชุด (คำท้า + ดวล + housekeeping)
-- อ้างอิง: doc/pvp-slice-1-draft-2026-09-03.md §4
--
-- ⚠️ เลขดาเมจ/คริ/timer ใน submit_pvp_card เป็น TEMP — ยังไม่จูน รอข้อมูลจริงแบบเดียวกับ raid FOC/SPD
--    จะจูนหลังเล่นจริงหลายแมตช์ (ห้ามเข้าใจผิดว่าเป็นเลขสุดท้าย)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- 0) _draw_pvp_hand — internal: จั่วมือ 5 ใบให้ผู้เล่นคนหนึ่ง (idempotent / resume-safe)
--    เอียงตาม lane ของ Qmon, กันจั่ว question ซ้ำภายในแมตช์เดียวกัน, ผูก question_id ทุกใบ
-- ============================================================
create or replace function public._draw_pvp_hand(p_match_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m public.pvp_matches;
  v_pet_id uuid;
  v_subline text;
  v_band text;
  v_next_hand int;
  v_lane_subject text;
  v_lane_branch text;
  v_used bigint[];
begin
  select * into v_m from public.pvp_matches where id = p_match_id;
  if not found or v_m.status <> 'active' then return; end if;

  -- ยังมีการ์ดค้างในมือ -> ไม่จั่วใหม่ (กันจั่วซ้ำตอน resume)
  if exists (
    select 1 from public.pvp_match_cards
    where match_id = p_match_id and drawn_for_user_id = p_user_id and played_at is null
  ) then
    return;
  end if;

  if p_user_id = v_m.player_a_id then v_pet_id := v_m.pet_a_id;
  else v_pet_id := v_m.pet_b_id; end if;

  select subline into v_subline from public.pets where id = v_pet_id;
  select grade_band into v_band from public.profiles where id = p_user_id;

  select coalesce(max(hand_no), 0) + 1 into v_next_hand
  from public.pvp_match_cards
  where match_id = p_match_id and drawn_for_user_id = p_user_id;

  select coalesce(array_agg(question_id), '{}'::bigint[]) into v_used
  from public.pvp_match_cards where match_id = p_match_id;

  if v_subline in ('math', 'science') then
    v_lane_subject := v_subline;
  elsif v_subline in ('physics', 'chemistry', 'biology') then
    v_lane_branch := v_subline;
  end if;

  -- TEMP: เอียง lane ~4 ใบ + เติมจาก pool เต็มให้ครบ 5 (ratio ชั่วคราว)
  with lane as (
    select id, chapter, subject, difficulty
    from public.questions
    where status = 'active'
      and (v_band is null or grade_band = v_band)
      and id <> all (v_used)
      and (
        (v_lane_subject is not null and subject = v_lane_subject)
        or (v_lane_branch is not null and branch = v_lane_branch)
      )
    order by random()
    limit 4
  ),
  fill as (
    select id, chapter, subject, difficulty
    from public.questions
    where status = 'active'
      and (v_band is null or grade_band = v_band)
      and id <> all (v_used)
      and id not in (select id from lane)
    order by random()
    limit 5
  ),
  picked as (
    select * from lane
    union all
    select * from fill
    limit 5
  )
  insert into public.pvp_match_cards
    (match_id, hand_no, drawn_for_user_id, chapter, subject, difficulty, question_id)
  select p_match_id, v_next_hand, p_user_id, p.chapter, p.subject, p.difficulty, p.id
  from picked p;
end;
$$;

revoke execute on function public._draw_pvp_hand(uuid, uuid) from public;

-- ============================================================
-- 1) create_pvp_challenge
-- ============================================================
create or replace function public.create_pvp_challenge(p_opponent_id uuid, p_pet_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_my_band text;
  v_opp_band text;
  v_pending int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if not exists (select 1 from public.pvp_allowlist where user_id = v_uid) then
    raise exception 'ยังไม่เปิดใช้ระบบประลองสำหรับบัญชีนี้';
  end if;
  if p_opponent_id = v_uid then raise exception 'ท้าตัวเองไม่ได้'; end if;

  -- flip คำท้าค้างของตัวเองที่หมดอายุก่อน (กัน unique index ค้าง)
  update public.pvp_challenges set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now()
    and (challenger_id = v_uid or opponent_id = v_uid);

  v_low := least(v_uid, p_opponent_id);
  v_high := greatest(v_uid, p_opponent_id);
  if not exists (
    select 1 from public.friendships where user_id_low = v_low and user_id_high = v_high
  ) then
    raise exception 'ท้าได้เฉพาะเพื่อนเท่านั้น';
  end if;

  select grade_band into v_my_band from public.profiles where id = v_uid;
  select grade_band into v_opp_band from public.profiles where id = p_opponent_id;
  if v_my_band is null or v_opp_band is null or v_my_band <> v_opp_band then
    raise exception 'ประลองได้เฉพาะเพื่อนที่อยู่ระดับชั้นเดียวกัน';
  end if;

  if not exists (
    select 1 from public.pets where id = p_pet_id and user_id = v_uid and stage = 4
  ) then
    raise exception 'เลือก Qmon ระดับสูงสุด (stage 4) ของคุณเท่านั้น';
  end if;

  select count(*) into v_pending
  from public.pvp_challenges
  where challenger_id = v_uid and status = 'pending' and expires_at > now();
  if v_pending >= 5 then
    raise exception 'มีคำท้าค้างครบ 5 รายการแล้ว รอตอบรับหรือหมดอายุก่อน';
  end if;

  if exists (
    select 1 from public.pvp_challenges
    where status = 'pending' and expires_at > now()
      and (
        (challenger_id = v_uid and opponent_id = p_opponent_id)
        or (challenger_id = p_opponent_id and opponent_id = v_uid)
      )
  ) then
    raise exception 'มีคำท้าระหว่างคุณสองคนค้างอยู่แล้ว';
  end if;

  insert into public.pvp_challenges (challenger_id, opponent_id, challenger_pet_id)
  values (v_uid, p_opponent_id, p_pet_id)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_pvp_challenge(uuid, uuid) to authenticated;

-- ============================================================
-- 2) decline_pvp_challenge / cancel_pvp_challenge
-- ============================================================
create or replace function public.decline_pvp_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  update public.pvp_challenges
    set status = 'declined', responded_at = now()
  where id = p_challenge_id and opponent_id = v_uid and status = 'pending';
  if not found then raise exception 'ปฏิเสธคำท้านี้ไม่ได้'; end if;
end;
$$;

grant execute on function public.decline_pvp_challenge(uuid) to authenticated;

create or replace function public.cancel_pvp_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  update public.pvp_challenges
    set status = 'cancelled', responded_at = now()
  where id = p_challenge_id and challenger_id = v_uid and status = 'pending';
  if not found then raise exception 'ยกเลิกคำท้านี้ไม่ได้'; end if;
end;
$$;

grant execute on function public.cancel_pvp_challenge(uuid) to authenticated;

-- ============================================================
-- 3) accept_pvp_challenge -> คืน match_id
-- ============================================================
create or replace function public.accept_pvp_challenge(p_challenge_id uuid, p_pet_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_ch public.pvp_challenges;
  v_pet_a public.pets;
  v_pet_b public.pets;
  v_stat_a jsonb;
  v_stat_b jsonb;
  v_hp_a int;
  v_hp_b int;
  v_attacker uuid;
  v_match_id uuid;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if not exists (select 1 from public.pvp_allowlist where user_id = v_uid) then
    raise exception 'ยังไม่เปิดใช้ระบบประลองสำหรับบัญชีนี้';
  end if;

  select * into v_ch from public.pvp_challenges where id = p_challenge_id for update;
  if not found then raise exception 'ไม่พบคำท้านี้'; end if;
  if v_ch.opponent_id <> v_uid then raise exception 'คำท้านี้ไม่ได้ส่งถึงคุณ'; end if;
  if v_ch.status <> 'pending' then raise exception 'คำท้านี้ถูกตอบไปแล้ว'; end if;
  if v_ch.expires_at <= now() then
    update public.pvp_challenges set status = 'expired', responded_at = now() where id = p_challenge_id;
    raise exception 'คำท้านี้หมดอายุแล้ว';
  end if;

  if not exists (
    select 1 from public.pets where id = p_pet_id and user_id = v_uid and stage = 4
  ) then
    raise exception 'เลือก Qmon ระดับสูงสุด (stage 4) ของคุณเท่านั้น';
  end if;

  select * into v_pet_a from public.pets where id = v_ch.challenger_pet_id;
  if not found or v_pet_a.user_id <> v_ch.challenger_id or v_pet_a.stage <> 4 then
    raise exception 'Qmon ของผู้ท้าใช้ไม่ได้แล้ว';
  end if;
  select * into v_pet_b from public.pets where id = p_pet_id;

  -- snapshot: raw (null -> 0). สไลซ์ 4 เติมโบนัสอุปกรณ์ PvP ที่จุดนี้ (คู่กับ pvpEffectiveStat)
  v_stat_a := jsonb_build_object(
    'hp', coalesce(v_pet_a.stat_hp, 0), 'atk', coalesce(v_pet_a.stat_atk, 0),
    'def', coalesce(v_pet_a.stat_def, 0), 'spd', coalesce(v_pet_a.stat_spd, 0),
    'foc', coalesce(v_pet_a.stat_foc, 0));
  v_stat_b := jsonb_build_object(
    'hp', coalesce(v_pet_b.stat_hp, 0), 'atk', coalesce(v_pet_b.stat_atk, 0),
    'def', coalesce(v_pet_b.stat_def, 0), 'spd', coalesce(v_pet_b.stat_spd, 0),
    'foc', coalesce(v_pet_b.stat_foc, 0));
  v_hp_a := greatest((v_stat_a->>'hp')::int, 1);
  v_hp_b := greatest((v_stat_b->>'hp')::int, 1);

  -- SPD สูงกว่าได้ส่งการ์ดก่อน, เท่ากัน = ผู้ท้า (A)
  if (v_stat_b->>'spd')::int > (v_stat_a->>'spd')::int then
    v_attacker := v_ch.opponent_id;
  else
    v_attacker := v_ch.challenger_id;
  end if;

  insert into public.pvp_matches (
    challenge_id, player_a_id, player_b_id, pet_a_id, pet_b_id,
    stat_a, stat_b, hp_a, hp_b, attacker_id, phase
  ) values (
    v_ch.id, v_ch.challenger_id, v_ch.opponent_id, v_pet_a.id, v_pet_b.id,
    v_stat_a, v_stat_b, v_hp_a, v_hp_b, v_attacker, 'assigning'
  ) returning id into v_match_id;

  update public.pvp_challenges set status = 'accepted', responded_at = now()
  where id = p_challenge_id;

  perform public._draw_pvp_hand(v_match_id, v_attacker);

  return v_match_id;
end;
$$;

grant execute on function public.accept_pvp_challenge(uuid, uuid) to authenticated;

-- ============================================================
-- 4) draw_pvp_cards -> คืนมือปัจจุบันของผู้ส่ง (setof pvp_match_cards)
-- ============================================================
create or replace function public.draw_pvp_cards(p_match_id uuid)
returns setof public.pvp_match_cards
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.pvp_matches;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  select * into v_m from public.pvp_matches where id = p_match_id;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;
  if v_uid not in (v_m.player_a_id, v_m.player_b_id) then raise exception 'ไม่ใช่แมตช์ของคุณ'; end if;
  if v_m.status <> 'active' then raise exception 'แมตช์นี้จบแล้ว'; end if;
  if v_m.attacker_id <> v_uid then raise exception 'ยังไม่ถึงตาส่งการ์ดของคุณ'; end if;
  if v_m.phase <> 'assigning' then raise exception 'ตอนนี้เป็นช่วงตอบคำถาม'; end if;

  perform public._draw_pvp_hand(p_match_id, v_uid);

  return query
    select * from public.pvp_match_cards
    where match_id = p_match_id and drawn_for_user_id = v_uid and played_at is null
    order by created_at;
end;
$$;

grant execute on function public.draw_pvp_cards(uuid) to authenticated;

-- ============================================================
-- 5) assign_pvp_card — ผู้ส่งเลือกการ์ด 1 ใบให้อีกฝ่ายทำ
-- ============================================================
create or replace function public.assign_pvp_card(p_match_id uuid, p_card_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.pvp_matches;
  v_card public.pvp_match_cards;
  v_max_hand int;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  select * into v_m from public.pvp_matches where id = p_match_id for update;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;
  if v_uid not in (v_m.player_a_id, v_m.player_b_id) then raise exception 'ไม่ใช่แมตช์ของคุณ'; end if;
  if v_m.status <> 'active' then raise exception 'แมตช์นี้จบแล้ว'; end if;
  if v_m.attacker_id <> v_uid then raise exception 'ยังไม่ถึงตาส่งการ์ดของคุณ'; end if;
  if v_m.phase <> 'assigning' then raise exception 'ส่งการ์ดไปแล้ว รออีกฝ่ายตอบ'; end if;

  select * into v_card from public.pvp_match_cards where id = p_card_id;
  if not found or v_card.match_id <> p_match_id or v_card.drawn_for_user_id <> v_uid
     or v_card.played_at is not null then
    raise exception 'การ์ดนี้ใช้ไม่ได้';
  end if;

  select max(hand_no) into v_max_hand
  from public.pvp_match_cards where match_id = p_match_id and drawn_for_user_id = v_uid;
  if v_card.hand_no <> v_max_hand then
    raise exception 'การ์ดนี้ไม่ได้อยู่ในมือปัจจุบัน';
  end if;

  -- ทิ้งการ์ดที่เหลือในมือนี้ -> ตาส่งครั้งหน้าจั่วใหม่ 5 ใบ
  delete from public.pvp_match_cards
  where match_id = p_match_id and drawn_for_user_id = v_uid
    and hand_no = v_card.hand_no and played_at is null and id <> p_card_id;

  update public.pvp_match_cards set played_at = now() where id = p_card_id;

  update public.pvp_matches
    set active_card_id = p_card_id,
        phase = 'answering',
        last_action_at = now(),
        timeout_at = now() + interval '3 days'
  where id = p_match_id;
end;
$$;

grant execute on function public.assign_pvp_card(uuid, uuid) to authenticated;

-- ============================================================
-- 6) submit_pvp_card — ผู้ตอบตอบการ์ดที่ถูกส่งมา
--    บันทึก quiz_attempts (source='pvp') · ตอบผิด/หมดเวลา = โดนดาเมจ · สลับตา · เช็คจบ
--    สไลซ์ 1: ไม่แตะ EXP ของ pet เลย (ปอนด์เคาะ — EXP จริงต่อสไลซ์ถัดไป)
-- ============================================================
create or replace function public.submit_pvp_card(
  p_match_id uuid, p_card_id uuid, p_question_id bigint, p_answer_index int
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.pvp_matches;
  v_card public.pvp_match_cards;
  v_defender uuid;
  v_def_pet uuid;
  v_correct int;
  v_is_correct boolean;
  v_atk int; v_foc int; v_def int;
  v_base int;
  v_dmg int := 0;
  v_crit boolean := false;
  v_new_status text;
  v_new_outcome text;
  v_new_winner uuid;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  select * into v_m from public.pvp_matches where id = p_match_id for update;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;
  if v_uid not in (v_m.player_a_id, v_m.player_b_id) then raise exception 'ไม่ใช่แมตช์ของคุณ'; end if;
  if v_m.status <> 'active' then raise exception 'แมตช์นี้จบแล้ว'; end if;
  if v_m.phase <> 'answering' then raise exception 'ยังไม่มีการ์ดให้ตอบ'; end if;
  if v_m.active_card_id is null or v_m.active_card_id <> p_card_id then
    raise exception 'การ์ดไม่ตรงกับที่กำลังเล่นอยู่';
  end if;

  v_defender := case when v_m.attacker_id = v_m.player_a_id then v_m.player_b_id else v_m.player_a_id end;
  if v_uid <> v_defender then raise exception 'ยังไม่ถึงตาตอบของคุณ'; end if;

  select * into v_card from public.pvp_match_cards where id = p_card_id;
  if v_card.question_id <> p_question_id then raise exception 'ข้อมูลคำถามไม่ตรง'; end if;

  select correct_index into v_correct from public.questions where id = p_question_id;
  if v_correct is null then raise exception 'ไม่พบคำถามนี้'; end if;

  -- p_answer_index = -1 => หมดเวลา (client timer) => นับเป็นตอบผิด
  v_is_correct := (p_answer_index = v_correct);

  v_def_pet := case when v_defender = v_m.player_a_id then v_m.pet_a_id else v_m.pet_b_id end;

  insert into public.quiz_attempts (user_id, question_id, is_correct, pet_id, source, pvp_match_id)
  values (v_defender, p_question_id, v_is_correct, v_def_pet, 'pvp', p_match_id);

  if not v_is_correct then
    -- attacker = ผู้ส่ง (ตี), defender = ผู้ตอบ (รับ)
    if v_m.attacker_id = v_m.player_a_id then
      v_atk := (v_m.stat_a->>'atk')::int; v_foc := (v_m.stat_a->>'foc')::int; v_def := (v_m.stat_b->>'def')::int;
    else
      v_atk := (v_m.stat_b->>'atk')::int; v_foc := (v_m.stat_b->>'foc')::int; v_def := (v_m.stat_a->>'def')::int;
    end if;

    -- TEMP: ยังไม่จูน รอข้อมูลจริงแบบ raid FOC/SPD
    v_base := round(10 * v_atk / 100.0)::int;
    v_dmg := greatest(1, round(v_base * (1 - v_def / 200.0))::int);
    if random() * 100 < v_foc then
      v_crit := true;
      v_dmg := round(v_dmg * 1.5)::int;
    end if;

    if v_defender = v_m.player_a_id then
      update public.pvp_matches set hp_a = hp_a - v_dmg where id = p_match_id;
    else
      update public.pvp_matches set hp_b = hp_b - v_dmg where id = p_match_id;
    end if;
  end if;

  select * into v_m from public.pvp_matches where id = p_match_id;

  if v_m.hp_a <= 0 or v_m.hp_b <= 0 then
    v_new_status := 'finished';
    if v_m.hp_a <= 0 then
      v_new_outcome := 'b_win'; v_new_winner := v_m.player_b_id;
    else
      v_new_outcome := 'a_win'; v_new_winner := v_m.player_a_id;
    end if;
  elsif v_m.current_round >= 30 then
    v_new_status := 'finished';
    if v_m.hp_a > v_m.hp_b then
      v_new_outcome := 'a_win'; v_new_winner := v_m.player_a_id;
    elsif v_m.hp_b > v_m.hp_a then
      v_new_outcome := 'b_win'; v_new_winner := v_m.player_b_id;
    else
      v_new_outcome := 'draw'; v_new_winner := null;
    end if;
  else
    v_new_status := 'active';
  end if;

  if v_new_status = 'finished' then
    update public.pvp_matches
      set status = 'finished', outcome = v_new_outcome, winner_id = v_new_winner,
          phase = 'assigning', active_card_id = null, last_action_at = now()
    where id = p_match_id;
  else
    update public.pvp_matches
      set attacker_id = v_defender,
          phase = 'assigning',
          active_card_id = null,
          current_round = current_round + 1,
          last_action_at = now(),
          timeout_at = now() + interval '3 days'
    where id = p_match_id;
    perform public._draw_pvp_hand(p_match_id, v_defender);
  end if;

  select * into v_m from public.pvp_matches where id = p_match_id;

  return jsonb_build_object(
    'is_correct', v_is_correct,
    'damage', v_dmg,
    'crit', v_crit,
    'hp_a', v_m.hp_a,
    'hp_b', v_m.hp_b,
    'status', v_m.status,
    'outcome', v_m.outcome,
    'winner_id', v_m.winner_id,
    'current_round', v_m.current_round,
    'attacker_id', v_m.attacker_id,
    'phase', v_m.phase
  );
end;
$$;

grant execute on function public.submit_pvp_card(uuid, uuid, bigint, int) to authenticated;

-- ============================================================
-- 7) pvp_gc — housekeeping (เรียก lazy จาก getPvpOverview)
-- ============================================================
create or replace function public.pvp_gc()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.pvp_challenges set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();

  update public.pvp_matches set status = 'abandoned', last_action_at = now()
  where status = 'active' and timeout_at <= now();
end;
$$;

grant execute on function public.pvp_gc() to authenticated;

commit;
