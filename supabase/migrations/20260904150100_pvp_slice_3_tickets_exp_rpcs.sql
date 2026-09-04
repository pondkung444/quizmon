-- Migration: 20260904150100_pvp_slice_3_tickets_exp_rpcs
-- PvP ประลอง — สไลซ์ 3: grant/consume ตั๋ว (lazy) + EXP ตอนแมตช์จบ + growth stat hookup
--
-- ⚠️ EXP 50/20 ยังเป็น TEMP (เหมือนเลขดาเมจ) — flag ให้เจ้าของโปรดักต์ก่อน merge
--
-- §0 (วิวัฒนาการ): RPC ให้ EXP กับ "ตัวที่กำลังเลี้ยง" ของแต่ละฝ่ายเท่านั้น — ไม่เช็ค stage-up
--   ในนี้ (option B). client เรียก reconcilePvpEvolution() ต่อหลังเห็นผลแมตช์ + หน้า pet เช็คซ้ำ
--   เป็น safety net. เกณฑ์ threshold/subline อยู่ที่ src/lib/evolution.ts จุดเดียว ไม่ port ลง SQL

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================
-- 1) _pvp_grant_tickets — lazy grant (daily 2 + raid bonus), เพดาน 15
-- ============================================================
create or replace function public._pvp_grant_tickets(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_available int;
  v_granted_today int;
  v_want int;
  v_cap constant int := 15;
  v_daily constant int := 2;
begin
  if p_user_id is null then return; end if;

  -- serialize การ grant ต่อ user กัน double-grant ตอน request ซ้อน (ปลดล็อกเมื่อจบ txn)
  perform pg_advisory_xact_lock(hashtext('pvp_grant:' || p_user_id::text));

  select count(*) into v_available
  from public.pvp_tickets where user_id = p_user_id and consumed_at is null;

  -- ---- daily free: เติมให้ครบ 2/วัน (ปฏิทินไทย) ----
  select count(*) into v_granted_today
  from public.pvp_tickets
  where user_id = p_user_id and source = 'daily_free' and granted_day = v_today;

  v_want := least(v_daily - v_granted_today, v_cap - v_available);
  if v_want > 0 then
    insert into public.pvp_tickets (user_id, source, granted_day)
    select p_user_id, 'daily_free', v_today from generate_series(1, v_want);
    v_available := v_available + v_want;
  end if;

  -- ---- raid bonus: +1 ต่อ raid run ที่ completed (ชนะ/แพ้นับหมด) และยังไม่เคยให้ตั๋ว ----
  if v_available < v_cap then
    insert into public.pvp_tickets (user_id, source, source_ref_id)
    select p_user_id, 'raid_bonus', r.id
    from public.raid_runs r
    where r.user_id = p_user_id
      and r.status = 'completed'
      and not exists (
        select 1 from public.pvp_tickets t
        where t.source = 'raid_bonus' and t.source_ref_id = r.id
      )
    order by r.completed_at asc nulls last
    limit (v_cap - v_available);
  end if;
end;
$$;

revoke execute on function public._pvp_grant_tickets(uuid) from anon, authenticated, public;

create or replace function public.pvp_grant_tickets()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then return; end if;
  perform public._pvp_grant_tickets(auth.uid());
end;
$$;

grant execute on function public.pvp_grant_tickets() to authenticated;

-- ============================================================
-- 2) create_pvp_challenge — grant lazy + ตัดตั๋ว 1 ใบ (ผู้ท้าเท่านั้น)
--    (คงตรรกะเดิมทั้งหมด — เพิ่มแค่ grant ต้น ๆ, เช็ค balance, consume ท้าย)
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

  -- flip คำท้าค้างที่หมดอายุก่อน (trigger จะคืนตั๋วให้เอง)
  update public.pvp_challenges set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now()
    and (challenger_id = v_uid or opponent_id = v_uid);

  -- เติมตั๋ว lazy แล้วเช็คว่ามีพอ (ก่อนทำงานหนักอื่น)
  perform public._pvp_grant_tickets(v_uid);
  if not exists (
    select 1 from public.pvp_tickets where user_id = v_uid and consumed_at is null
  ) then
    raise exception 'ตั๋วประลองหมด — เติมวันละ 2 ใบ หรือได้เพิ่ม 1 ใบต่อการผจญภัยที่จบ';
  end if;

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

  -- ตัดตั๋วใบเก่าสุด ผูกกับคำท้านี้ (trigger คืนให้เองถ้าโดนปฏิเสธ/ยกเลิก/หมดอายุ)
  update public.pvp_tickets
  set consumed_at = now(), consumed_challenge_id = v_id
  where id = (
    select id from public.pvp_tickets
    where user_id = v_uid and consumed_at is null
    order by granted_at asc
    limit 1
    for update skip locked
  );
  if not found then
    raise exception 'ตั๋วประลองหมด — เติมวันละ 2 ใบ หรือได้เพิ่ม 1 ใบต่อการผจญภัยที่จบ';
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_pvp_challenge(uuid, uuid) to authenticated;

-- ============================================================
-- 3) _pvp_resolve_round — เพิ่ม growth-stat hookup (§3) + EXP ตอนจบ (§2)
--    ฐานเดิม = 20260904140000 (v_base 0.55)
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
  v_dmg int := 0;
  v_pierce int := 0;
  v_crit boolean := false;
  v_self_dmg int := 0;
  v_heal_self int := 0;
  v_heal_def int := 0;
  v_heal_self_applied int := 0;
  v_heal_def_applied int := 0;
  v_eff_triggered boolean := false;

  v_new_status text;
  v_new_outcome text;
  v_new_winner uuid;

  -- สไลซ์ 3: EXP ตอนจบ
  v_active_a uuid;
  v_active_b uuid;
  v_exp_a int := 0;
  v_exp_b int := 0;
begin
  select * into v_m from public.pvp_matches where id = p_match_id for update;
  if not found then raise exception 'ไม่พบแมตช์นี้'; end if;

  if v_m.status <> 'active' or v_m.phase <> 'answering' or v_m.active_card_id is null then
    return jsonb_build_object(
      'is_correct', null, 'damage', 0, 'crit', false,
      'hp_a', v_m.hp_a, 'hp_b', v_m.hp_b,
      'status', v_m.status, 'outcome', v_m.outcome, 'winner_id', v_m.winner_id,
      'current_round', v_m.current_round, 'attacker_id', v_m.attacker_id, 'phase', v_m.phase,
      'effect_id', null, 'effect_triggered', false,
      'self_damage', 0, 'heal_self', 0, 'heal_defender', 0, 'pierce', 0,
      'exp_a', v_m.exp_a, 'exp_b', v_m.exp_b, 'exp_pet_a', v_m.exp_pet_a, 'exp_pet_b', v_m.exp_pet_b,
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

  -- §3: ตอบถูก -> เพิ่ม math_correct/science_correct ให้ Qmon ผู้ตอบ (ไม่มีคอมโบ PvP)
  if v_is_correct then
    perform public.apply_quiz_answer_pet_update(
      v_def_pet, 0, 0,
      (case when v_card.subject = 'math' then 1 else 0 end),
      (case when v_card.subject = 'science' then 1 else 0 end)
    );
  end if;

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

  v_base := round(v_atk * 0.55)::int;

  if v_is_correct then
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
    v_dmg := greatest(1, round(v_base * (1 - v_def_def / 200.0))::int);
    if random() * 100 < v_foc then
      v_crit := true;
      v_dmg := round(v_dmg * 1.5)::int;
    end if;

    if v_effect = 'high_stake' then
      v_dmg := v_dmg * 2;
      v_eff_triggered := true;
    elsif v_effect = 'lifesteal' then
      v_heal_self := v_dmg;
      v_eff_triggered := true;
    end if;
  end if;

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

  if v_m.hp_a <= 0 or v_m.hp_b <= 0 then
    v_new_status := 'finished';
    if v_m.hp_a <= 0 and v_m.hp_b <= 0 then
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
    -- §2: EXP ให้ "ตัวที่กำลังเลี้ยง" ของแต่ละฝ่าย (ชนะ 50 / แพ้ 20 / เสมอ 20-20) — TEMP
    select id into v_active_a from public.pets
      where user_id = v_m.player_a_id and is_active = true limit 1;
    select id into v_active_b from public.pets
      where user_id = v_m.player_b_id and is_active = true limit 1;

    if v_new_outcome = 'a_win' then v_exp_a := 50; v_exp_b := 20;
    elsif v_new_outcome = 'b_win' then v_exp_a := 20; v_exp_b := 50;
    else v_exp_a := 20; v_exp_b := 20;
    end if;

    -- ไม่แตะ exp_today/exp_today_date -> soft cap 180/วัน แยกขาด
    if v_active_a is not null then
      update public.pets set exp = exp + v_exp_a where id = v_active_a;
    end if;
    if v_active_b is not null then
      update public.pets set exp = exp + v_exp_b where id = v_active_b;
    end if;

    update public.pvp_matches
      set status = 'finished', outcome = v_new_outcome, winner_id = v_new_winner,
          phase = 'assigning', active_card_id = null, round_deadline = null, last_action_at = now(),
          exp_a = v_exp_a, exp_b = v_exp_b, exp_pet_a = v_active_a, exp_pet_b = v_active_b
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
    'damage', v_dmg + v_pierce,
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
    'self_damage', v_self_dmg,
    'heal_self', v_heal_self_applied,
    'heal_defender', v_heal_def_applied,
    'pierce', v_pierce,
    'defender_side', case when v_defender = v_m.player_a_id then 'a' else 'b' end,
    'attacker_side', case when v_attacker = v_m.player_a_id then 'a' else 'b' end,
    'exp_a', v_m.exp_a,
    'exp_b', v_m.exp_b,
    'exp_pet_a', v_m.exp_pet_a,
    'exp_pet_b', v_m.exp_pet_b,
    'timed_out', p_timed_out
  );
end;
$$;

revoke execute on function public._pvp_resolve_round(uuid, int, boolean) from anon, authenticated, public;

commit;
