-- Migration: 20260904120100_pvp_slice_2_rpcs
-- ระบบ "ประลอง" (PvP) — สไลซ์ 2: เอฟเฟกต์การ์ด + นาฬิกาตอบ server-enforced
--
-- ⚠️ เลขดาเมจ/เอฟเฟกต์/timer ทั้งหมดยังเป็น TEMP — ยังไม่จูน (เหมือนสไลซ์ 1)
--    ต้อง flag ให้เจ้าของโปรดักต์อีกครั้งก่อน merge:
--      1) ตัวเลขดาเมจของเอฟเฟกต์ทั้ง 6 เป็น placeholder
--      2) พฤติกรรม "หมดเวลา = นับเป็นตอบผิด" (timeout-as-wrong-answer) เป็น default ที่สมเหตุผล
--         แต่ยังไม่ได้เซ็นอนุมัติเป็นคำต่อคำ
--
-- สิ่งที่ทำ:
--   - _draw_pvp_hand      : สุ่ม effect_id ให้การ์ด (~40% เปล่า, ~60% กระจาย 6 เอฟเฟกต์)
--   - assign_pvp_card     : ตั้ง round_deadline ตอนเข้า phase 'answering' (haste = 30 วิ)
--   - _pvp_resolve_round  : internal ใหม่ — เรโซลูชันยก 1 ยก (ดาเมจฐาน + เอฟเฟกต์ + สลับตา + เช็คจบ)
--   - submit_pvp_card     : ตรวจสิทธิ์/สถานะเหมือนเดิม แล้ว delegate ไป _pvp_resolve_round
--   - pvp_gc_round_timeouts: resolve ยกที่ round_deadline หมดแล้วแบบ lazy (นับเป็นตอบผิด)
--   - pvp_gc              : เรียก pvp_gc_round_timeouts ต่อท้าย housekeeping เดิม

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- 0) _draw_pvp_hand — เพิ่มการสุ่ม effect_id (question-selection เดิมไม่แตะ)
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
    (match_id, hand_no, drawn_for_user_id, chapter, subject, difficulty, question_id, effect_id)
  select
    p_match_id, v_next_hand, p_user_id, p.chapter, p.subject, p.difficulty, p.id,
    -- TEMP ratio: ~40% เปล่า, ที่เหลือกระจายเท่า ๆ กันใน 6 เอฟเฟกต์ (~10% ต่อแบบ)
    case
      when random() < 0.40 then null
      else (array['reprisal','pierce','heal','high_stake','lifesteal','haste'])[1 + floor(random() * 6)::int]
    end
  from picked p;
end;
$$;

revoke execute on function public._draw_pvp_hand(uuid, uuid) from public;

-- ============================================================
-- 1) assign_pvp_card — ตั้ง round_deadline ตอนเข้า phase 'answering'
--    deadline = now() + 60วิ + round(spd_ผู้ตอบ/20) วิ  (ปกติ)
--             = now() + 30วิ                             (การ์ด effect_id = 'haste')
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
  v_defender uuid;
  v_spd int;
  v_deadline timestamptz;
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

  delete from public.pvp_match_cards
  where match_id = p_match_id and drawn_for_user_id = v_uid
    and hand_no = v_card.hand_no and played_at is null and id <> p_card_id;

  update public.pvp_match_cards set played_at = now() where id = p_card_id;

  -- นาฬิกาตอบเริ่มนับ ณ ตอนนี้ (จังหวะที่ผู้ตอบเห็นโจทย์ครั้งแรก)
  v_defender := case when v_m.attacker_id = v_m.player_a_id then v_m.player_b_id else v_m.player_a_id end;
  v_spd := case when v_defender = v_m.player_a_id
                then (v_m.stat_a->>'spd')::int else (v_m.stat_b->>'spd')::int end;
  if v_card.effect_id = 'haste' then
    v_deadline := now() + interval '30 seconds';
  else
    v_deadline := now() + make_interval(secs => (60 + round(coalesce(v_spd, 0) / 20.0))::double precision);
  end if;

  update public.pvp_matches
    set active_card_id = p_card_id,
        phase = 'answering',
        round_deadline = v_deadline,
        last_action_at = now(),
        timeout_at = now() + interval '3 days'
  where id = p_match_id;
end;
$$;

grant execute on function public.assign_pvp_card(uuid, uuid) to authenticated;

-- ============================================================
-- 2) _pvp_resolve_round — internal: เรโซลูชัน 1 ยก
--    p_timed_out = true  -> ไม่มีคำตอบ (นับเป็นตอบผิด, ไม่สนใจ p_answer_index)
--    เรียกจาก submit_pvp_card (คำตอบจริง) และ pvp_gc_round_timeouts (หมดเวลา)
-- ============================================================
create or replace function public._pvp_resolve_round(
  p_match_id uuid, p_answer_index int, p_timed_out boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m public.pvp_matches;
  v_card public.pvp_match_cards;
  v_attacker uuid;
  v_defender uuid;
  v_def_pet uuid;
  v_correct int;
  v_is_correct boolean;
  v_effect text;

  v_atk int; v_foc int; v_atk_def int; v_def_def int;
  v_atk_hp_max int; v_def_hp_max int;
  v_atk_hp_now int; v_def_hp_now int;
  v_atk_hp_new int; v_def_hp_new int;

  v_base int;
  v_dmg int := 0;          -- ดาเมจฐานใส่ผู้ตอบ (ตอบผิด)
  v_pierce int := 0;       -- ดาเมจ pierce ใส่ผู้ตอบ (ตอบถูก)
  v_crit boolean := false;
  v_self_dmg int := 0;     -- reprisal — ดาเมจสะท้อนใส่ผู้ส่ง
  v_heal_self int := 0;    -- lifesteal — เลือดคืนผู้ส่ง (ก่อน cap)
  v_heal_def int := 0;     -- heal — เลือดคืนผู้ตอบ (ก่อน cap)
  v_heal_self_applied int := 0;
  v_heal_def_applied int := 0;
  v_eff_triggered boolean := false;

  v_new_status text;
  v_new_outcome text;
  v_new_winner uuid;
begin
  select * into v_m from public.pvp_matches where id = p_match_id for update;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;

  -- ยกนี้ถูกเรโซลูชันไปแล้ว (เช่น race กับ gc) -> คืนสถานะปัจจุบันแบบ no-op
  if v_m.status <> 'active' or v_m.phase <> 'answering' or v_m.active_card_id is null then
    return jsonb_build_object(
      'is_correct', null, 'damage', 0, 'crit', false,
      'hp_a', v_m.hp_a, 'hp_b', v_m.hp_b,
      'status', v_m.status, 'outcome', v_m.outcome, 'winner_id', v_m.winner_id,
      'current_round', v_m.current_round, 'attacker_id', v_m.attacker_id, 'phase', v_m.phase,
      'effect_id', null, 'effect_triggered', false,
      'self_damage', 0, 'heal_self', 0, 'heal_defender', 0, 'pierce', 0,
      'timed_out', p_timed_out, 'noop', true
    );
  end if;

  select * into v_card from public.pvp_match_cards where id = v_m.active_card_id;
  v_effect := v_card.effect_id;

  v_attacker := v_m.attacker_id;
  v_defender := case when v_attacker = v_m.player_a_id then v_m.player_b_id else v_m.player_a_id end;
  v_def_pet := case when v_defender = v_m.player_a_id then v_m.pet_a_id else v_m.pet_b_id end;

  select correct_index into v_correct from public.questions where id = v_card.question_id;
  if v_correct is null then raise exception 'ไม่พบคำถามนี้'; end if;

  v_is_correct := (not p_timed_out) and (p_answer_index = v_correct);

  insert into public.quiz_attempts (user_id, question_id, is_correct, pet_id, source, pvp_match_id)
  values (v_defender, v_card.question_id, v_is_correct, v_def_pet, 'pvp', p_match_id);

  -- ---- ดึงสเตตัส (attacker = ผู้ส่ง/ผู้ตี, defender = ผู้ตอบ/ผู้รับ) ----
  if v_attacker = v_m.player_a_id then
    v_atk := (v_m.stat_a->>'atk')::int; v_foc := (v_m.stat_a->>'foc')::int;
    v_atk_def := (v_m.stat_a->>'def')::int; v_def_def := (v_m.stat_b->>'def')::int;
    v_atk_hp_max := (v_m.stat_a->>'hp')::int; v_def_hp_max := (v_m.stat_b->>'hp')::int;
  else
    v_atk := (v_m.stat_b->>'atk')::int; v_foc := (v_m.stat_b->>'foc')::int;
    v_atk_def := (v_m.stat_b->>'def')::int; v_def_def := (v_m.stat_a->>'def')::int;
    v_atk_hp_max := (v_m.stat_b->>'hp')::int; v_def_hp_max := (v_m.stat_a->>'hp')::int;
  end if;
  v_atk_hp_max := greatest(coalesce(v_atk_hp_max, 1), 1);
  v_def_hp_max := greatest(coalesce(v_def_hp_max, 1), 1);
  v_atk := coalesce(v_atk, 0); v_foc := coalesce(v_foc, 0);
  v_atk_def := coalesce(v_atk_def, 0); v_def_def := coalesce(v_def_def, 0);

  v_base := round(10 * v_atk / 100.0)::int;

  if v_is_correct then
    -- ---- ตอบถูก: ปกติไม่มีอะไรเกิด — เอฟเฟกต์ฝั่ง "correct" เท่านั้นที่ทำงาน ----
    if v_effect = 'reprisal' then
      v_self_dmg := greatest(0, round(v_base * (1 - v_atk_def / 200.0))::int);
      v_eff_triggered := v_self_dmg > 0;
    elsif v_effect = 'pierce' then
      v_pierce := greatest(1, round(v_base * 0.3)::int);
      v_eff_triggered := true;
    elsif v_effect = 'heal' then
      v_heal_def := greatest(0, v_base);
      v_eff_triggered := v_heal_def > 0;
    end if;
  else
    -- ---- ตอบผิด/หมดเวลา: ดาเมจฐาน (สูตรเดิมสไลซ์ 1) + เอฟเฟกต์ฝั่ง "incorrect" ----
    v_dmg := greatest(1, round(v_base * (1 - v_def_def / 200.0))::int);
    if random() * 100 < v_foc then
      v_crit := true;
      v_dmg := round(v_dmg * 1.5)::int;
    end if;

    if v_effect = 'high_stake' then
      v_dmg := v_dmg * 2;                 -- คูณหลัง DEF + crit
      v_eff_triggered := true;
    elsif v_effect = 'lifesteal' then
      v_heal_self := v_dmg;               -- เลือดคืนผู้ส่งเท่าดาเมจที่สร้างได้ (ก่อน cap)
      v_eff_triggered := true;
    end if;
  end if;

  -- ---- คำนวณ HP ใหม่ (heal ติดเพดาน max HP, ดาเมจทะลุ 0 ได้เพื่อให้ตรวจจบ) ----
  v_def_hp_now := case when v_defender = v_m.player_a_id then v_m.hp_a else v_m.hp_b end;
  v_atk_hp_now := case when v_attacker = v_m.player_a_id then v_m.hp_a else v_m.hp_b end;

  v_heal_def_applied := least(v_heal_def, greatest(0, v_def_hp_max - v_def_hp_now));
  v_heal_self_applied := least(v_heal_self, greatest(0, v_atk_hp_max - v_atk_hp_now));

  v_def_hp_new := v_def_hp_now - v_dmg - v_pierce + v_heal_def_applied;
  v_atk_hp_new := v_atk_hp_now - v_self_dmg + v_heal_self_applied;

  if v_defender = v_m.player_a_id then
    update public.pvp_matches set hp_a = v_def_hp_new, hp_b = v_atk_hp_new where id = p_match_id;
  else
    update public.pvp_matches set hp_b = v_def_hp_new, hp_a = v_atk_hp_new where id = p_match_id;
  end if;

  select * into v_m from public.pvp_matches where id = p_match_id;

  -- ---- เช็คจบแมตช์ (ลำดับเดิม: HP หมดก่อน แล้วค่อยเพดานยก) ----
  if v_m.hp_a <= 0 or v_m.hp_b <= 0 then
    v_new_status := 'finished';
    if v_m.hp_a <= 0 and v_m.hp_b <= 0 then
      -- ทั้งคู่ล้มพร้อมกัน (เช่น reprisal) — HP เหลือมากกว่าชนะ, เท่ากันเสมอ
      if v_m.hp_a > v_m.hp_b then
        v_new_outcome := 'a_win'; v_new_winner := v_m.player_a_id;
      elsif v_m.hp_b > v_m.hp_a then
        v_new_outcome := 'b_win'; v_new_winner := v_m.player_b_id;
      else
        v_new_outcome := 'draw'; v_new_winner := null;
      end if;
    elsif v_m.hp_a <= 0 then
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
          phase = 'assigning', active_card_id = null, round_deadline = null, last_action_at = now()
    where id = p_match_id;
  else
    update public.pvp_matches
      set attacker_id = v_defender,
          phase = 'assigning',
          active_card_id = null,
          round_deadline = null,
          current_round = current_round + 1,
          last_action_at = now(),
          timeout_at = now() + interval '3 days'
    where id = p_match_id;
    perform public._draw_pvp_hand(p_match_id, v_defender);
  end if;

  select * into v_m from public.pvp_matches where id = p_match_id;

  return jsonb_build_object(
    'is_correct', v_is_correct,
    'damage', v_dmg + v_pierce,          -- ดาเมจรวมที่ผู้ตอบได้รับยกนี้
    'crit', v_crit,
    'hp_a', v_m.hp_a,
    'hp_b', v_m.hp_b,
    'status', v_m.status,
    'outcome', v_m.outcome,
    'winner_id', v_m.winner_id,
    'current_round', v_m.current_round,
    'attacker_id', v_m.attacker_id,
    'phase', v_m.phase,
    'effect_id', v_effect,
    'effect_triggered', v_eff_triggered,
    'self_damage', v_self_dmg,           -- reprisal: ดาเมจใส่ผู้ส่ง
    'heal_self', v_heal_self_applied,    -- lifesteal: เลือดคืนผู้ส่ง (หลัง cap)
    'heal_defender', v_heal_def_applied, -- heal: เลือดคืนผู้ตอบ (หลัง cap)
    'pierce', v_pierce,
    'defender_side', case when v_defender = v_m.player_a_id then 'a' else 'b' end,
    'attacker_side', case when v_attacker = v_m.player_a_id then 'a' else 'b' end,
    'timed_out', p_timed_out
  );
end;
$$;

revoke execute on function public._pvp_resolve_round(uuid, int, boolean) from public;

-- ============================================================
-- 3) submit_pvp_card — ตรวจสิทธิ์/สถานะเหมือนเดิม แล้ว delegate
--    (หมายเหตุ: ถ้าเรียกหลัง round_deadline หมดแล้วก็ยังประมวลผลปกติ — ตามที่ handoff ระบุ)
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

  return public._pvp_resolve_round(p_match_id, p_answer_index, false);
end;
$$;

grant execute on function public.submit_pvp_card(uuid, uuid, bigint, int) to authenticated;

-- ============================================================
-- 4) pvp_gc_round_timeouts — resolve ยกที่ round_deadline หมดแล้ว (lazy, นับเป็นตอบผิด)
--    เรียกจาก getPvpMatchView / getPvpOverview (ผ่าน pvp_gc) — ไม่มี cron ในโปรเจกต์นี้
-- ============================================================
create or replace function public.pvp_gc_round_timeouts()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.pvp_matches
    where status = 'active' and phase = 'answering'
      and round_deadline is not null and round_deadline < now()
    for update skip locked
  loop
    perform public._pvp_resolve_round(v_id, -1, true);
  end loop;
end;
$$;

grant execute on function public.pvp_gc_round_timeouts() to authenticated;

-- ============================================================
-- 5) pvp_gc — เรียก pvp_gc_round_timeouts ต่อท้าย
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

  perform public.pvp_gc_round_timeouts();
end;
$$;

grant execute on function public.pvp_gc() to authenticated;

commit;
