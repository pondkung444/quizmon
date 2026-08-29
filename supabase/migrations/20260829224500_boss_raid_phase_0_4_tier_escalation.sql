-- Migration: 20260829224500_boss_raid_phase_0_4_tier_escalation
-- Classroom Boss Raid — Phase 0.4 (Escalating Tier System)
-- อ้างอิง: classroom-boss-raid-design-2026-08-28-v2.md §11 (sub-phase 0.4), §3 (Escalating Tier System)
--
-- ต่อยอด 0.3: ตอบผิด/timeout -> wrong_count_total += 1 (เดิม) + logic ใหม่:
--   1. เทียบ wrong_count_total ใหม่กับ threshold ตาม config.difficulty (default 'medium')
--   2. คำนวณ tier ที่ควรจะเป็นจาก count ตรง ๆ (handle ข้ามขั้นในทีเดียว กรณี timeout พร้อมกันหลายคน)
--   3. current_tier := greatest(ของเดิม, ที่คำนวณใหม่) — ขยับทางเดียว ห้ามถอย
--   4. crystal_damage = round(base_tier_damage[new tier] * (100 / avg_def_snapshot))
--   5. crystal_hp := greatest(0, crystal_hp - crystal_damage)   [decrement ใน DB, กัน race]
--
-- threshold (เทียบ wrong_count_total สะสมทั้งห้อง):
--   easy   : เบา->กลาง 10 , กลาง->แรง 20
--   medium : เบา->กลาง  7 , กลาง->แรง 14
--   hard   : เบา->กลาง  5 , กลาง->แรง 10
-- base_tier_damage: light=1, medium=2, heavy=3 (= rank ของ tier)
--
-- ไม่มี schema change — column ทั้งหมด (current_tier, crystal_hp, wrong_count_total, avg_stat_snapshot)
-- มีอยู่แล้วจาก 0.1/0.2. แก้เฉพาะฟังก์ชัน submit_boss_raid_answer.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.submit_boss_raid_answer(
  p_participant_id uuid, p_question_id bigint,
  p_question_started_at timestamptz, p_answer text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.boss_raid_participants;
  v_s public.boss_raid_sessions;
  v_config jsonb;
  v_timer int;
  v_existing public.boss_raid_answers;
  v_q public.questions;
  v_is_correct boolean;
  v_is_crit boolean := false;
  v_damage int := 0;
  v_atk numeric; v_foc numeric; v_crit_chance int;
  v_inserted public.boss_raid_answers;
  v_boss_hp int;
  v_crystal_hp int;
  v_cur_tier text;
  v_ans text := btrim(coalesce(p_answer, ''));
  -- 0.4 — tier escalation
  v_t1 int; v_t2 int;                 -- threshold เบา->กลาง / กลาง->แรง
  v_wrong_new int;
  v_avg_def numeric;
  v_target_rank int;
  v_new_rank int;
  v_new_tier text;
  v_crystal_damage int;               -- null ถ้าตอบถูก
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_existing from public.boss_raid_answers
  where participant_id = p_participant_id and question_id = p_question_id
    and question_started_at = p_question_started_at;
  if found then
    select boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null);
  end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  if v_p.current_question_id is distinct from p_question_id
     or v_p.question_started_at is distinct from p_question_started_at then
    raise exception 'ข้อนี้หมดอายุแล้ว ขอข้อใหม่';
  end if;

  v_config := coalesce(v_s.config, '{}'::jsonb);
  v_timer  := coalesce((v_config->>'timer_seconds')::int, 30)
              + round(coalesce((v_p.stat_snapshot->>'spd')::numeric,0)/20)::int;

  select * into v_q from public.questions where id = p_question_id;

  if now() > p_question_started_at + make_interval(secs => v_timer) then
    v_is_correct := false;
  else
    -- รับได้ทั้ง index ("2") และข้อความ choice — กัน client ส่งผิดฟอร์แมตแล้วพังเงียบ
    v_is_correct := (v_ans = v_q.correct_index::text)
                    or (v_ans <> '' and v_ans = (v_q.choices ->> v_q.correct_index));
  end if;

  if v_is_correct then
    v_atk := coalesce((v_p.stat_snapshot->>'atk')::numeric, 0);
    v_foc := coalesce((v_p.stat_snapshot->>'foc')::numeric, 0);
    v_damage := round(10 * (v_atk / 100));
    v_crit_chance := least(50, round(v_foc / 2)::int);
    v_is_crit := (floor(random() * 100) < v_crit_chance);
    if v_is_crit then v_damage := round(v_damage * 1.5); end if;
  end if;

  insert into public.boss_raid_answers
    (session_id, participant_id, question_id, question_started_at, is_correct, is_crit, damage_dealt)
  values (v_p.session_id, p_participant_id, p_question_id, p_question_started_at, v_is_correct,
          case when v_is_correct then v_is_crit end,
          case when v_is_correct then v_damage end)
  on conflict (participant_id, question_id, question_started_at) do nothing
  returning * into v_inserted;

  if v_inserted.id is null then
    select * into v_existing from public.boss_raid_answers
    where participant_id = p_participant_id and question_id = p_question_id
      and question_started_at = p_question_started_at;
    select boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null);
  end if;

  if v_is_correct and v_damage > 0 then
    update public.boss_raid_sessions set boss_hp = greatest(0, coalesce(boss_hp,0) - v_damage)
      where id = v_p.session_id
      returning boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier;

  elsif not v_is_correct then
    -- threshold ตาม difficulty (default medium — เผื่อห้องเก่า 0.1-0.3 ที่อาจไม่มีค่านี้)
    case v_config->>'difficulty'
      when 'easy' then v_t1 := 10; v_t2 := 20;
      when 'hard' then v_t1 := 5;  v_t2 := 10;
      else             v_t1 := 7;  v_t2 := 14;
    end case;

    -- (1) atomic increment — อ่านค่าจริงหลัง +1 + state ปัจจุบันของ row กลับมา
    update public.boss_raid_sessions
      set wrong_count_total = wrong_count_total + 1
      where id = v_p.session_id
      returning wrong_count_total, current_tier,
               coalesce((avg_stat_snapshot->>'def')::numeric, 0)
      into v_wrong_new, v_cur_tier, v_avg_def;

    -- (2) tier ที่ wrong_count บอก "ตอนนี้" — คำนวณจากยอดสะสมตรง ๆ (ข้ามขั้นได้)
    v_target_rank := case when v_wrong_new >= v_t2 then 3
                          when v_wrong_new >= v_t1 then 2
                          else 1 end;
    -- (3) guard ขยับทางเดียว: ไม่ถอยกลับแม้ threshold ใหม่ต่ำกว่า tier เดิม
    v_new_rank := greatest(
      v_target_rank,
      case v_cur_tier when 'heavy' then 3 when 'medium' then 2 else 1 end
    );
    v_new_tier := case v_new_rank when 3 then 'heavy' when 2 then 'medium' else 'light' end;

    -- (4) ดาเมจใช้ tier ใหม่ (หลังข้อ 3); base_tier_damage = rank
    v_crystal_damage := round(
      v_new_rank * (100.0 / coalesce(nullif(v_avg_def, 0), 100))
    )::int;

    -- (5)+(6) decrement ใน DB (กัน race ตอบผิดพร้อมกัน) + เขียน tier ใหม่
    update public.boss_raid_sessions
      set current_tier = v_new_tier,
          crystal_hp   = greatest(0, coalesce(crystal_hp, 0) - v_crystal_damage)
      where id = v_p.session_id
      returning boss_hp, crystal_hp, current_tier
      into v_boss_hp, v_crystal_hp, v_cur_tier;

  else
    select boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier
      from public.boss_raid_sessions where id = v_p.session_id;
  end if;

  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null
    where id = p_participant_id;

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp,
    'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier,
    'crystal_damage', v_crystal_damage);
end;
$$;
grant execute on function public.submit_boss_raid_answer(uuid, bigint, timestamptz, text) to authenticated;

commit;

-- ============================================================
-- Rollback: re-apply 20260829221946_boss_raid_phase_0_3_quiz_loop's
--   submit_boss_raid_answer definition (no schema change to revert).
-- ============================================================
