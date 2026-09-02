-- Migration: 20260903140000_boss_raid_phase_2_chosen_warrior
-- Classroom Boss Raid — Phase 2: Event "นักรบถูกเลือก" (Chosen Warrior)
-- อ้างอิง: task brief boss-raid-chosen-warrior (เคาะกับปอนด์ครบ 2026-09-03)
--
-- Event ตัวที่ 3 — ต่างจาก จุดอ่อนเผย/ฝนดาวตก ตรง:
--   * trigger แบบ deterministic (ไม่ใช่ % roll): (a) tier ขยับเข้า "แรง" (edge — before<>after)
--     หรือ (b) ผิดติดกัน (streak) ครบ N ครั้ง — N = t1 ถ้า tier ปัจจุบัน light, ไม่งั้น t2
--   * ไม่มี auto-expire — จบได้ 2 ทาง: คนที่ถูกเลือกตอบ / ครูกดข้าม (dismiss_boss_raid_event)
--   * freeze คำถามปกติทั้งห้อง: คนอื่นแช่ข้อเดิมไว้ พอ event จบ ดัน question_started_at ไปข้างหน้า
--     เท่าเวลาที่ freeze (started_at -> now()) เพื่อคืนเวลาที่เหลือ
--
-- กลไก:
--   * สุ่มเกณฑ์ 50/50: 'single' (1 ใน 5 แกน atk/def/spd/foc/hp) หรือ 'total' (ผลรวม 5 แกน)
--   * weighted lottery เลือกผู้เล่น: น้ำหนัก = ค่า stat ตามเกณฑ์ (linear) — order by -ln(random())/weight
--     สุ่มจาก participant ทุกคนใน session (ไม่กรอง online/active)
--   * ตอบถูก -> บอสโดน (base atk-damage + crit roll ปกติ) x3, บวก participant.total_damage
--   * ตอบผิด -> คริสตัลโดน (rank ปัจจุบัน x 100/avg_def) x2.5 — ไม่ +wrong_count_total ไม่ escalate tier
--   * active_event ห้ามมี correct_index (broadcast ทั้งแถวผ่าน realtime — เหมือน meteor)
--
-- Base = submit_boss_raid_answer / submit_boss_raid_event_answer จาก 20260902180000_boss_raid_phase_1_rewards.sql

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ===== 1. Schema =====

alter table public.boss_raid_sessions
  add column if not exists wrong_streak_current int not null default 0;

comment on column public.boss_raid_sessions.wrong_streak_current is
  'จำนวนคำตอบผิด/timeout "ติดกัน" ปัจจุบันทั้งห้อง — reset 0 ทุกครั้งที่มีคนตอบถูก และตอน chosen_warrior trigger. '
  'แยกจาก wrong_count_total (สะสมตลอดเกม ใช้ escalate tier).';

comment on column public.boss_raid_sessions.active_event is
  'Event ที่กำลังทำงานอยู่ (null = ไม่มี). weak_point: {type,expires_at}. '
  'meteor: {type,question_id,question_text,choices,expires_at,winner_participant_id}. '
  'chosen_warrior: {type,started_at,chosen_participant_id,chosen_name,criterion,stat_key,stat_value,'
  'question_id,question_text,choices} — ไม่มี expires_at (จบด้วยคนตอบ/ครูกดข้าม). '
  '⚠️ ห้ามใส่ correct_index — column นี้ถูก broadcast ทั้งแถวผ่าน realtime.';

alter table public.boss_raid_event_log
  drop constraint if exists boss_raid_event_log_event_type_check;
alter table public.boss_raid_event_log
  add constraint boss_raid_event_log_event_type_check
  check (event_type in ('weak_point', 'meteor', 'meteor_attempt', 'chosen_warrior', 'chosen_warrior_answer'));

-- ===== 2. submit_boss_raid_answer — + wrong_streak bookkeeping + chosen_warrior trigger =====

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
  v_t1 int; v_t2 int;
  v_base_t1 int; v_base_t2 int;
  v_n int;
  v_wrong_new int;
  v_avg_def numeric;
  v_target_rank int;
  v_new_rank int;
  v_new_tier text;
  v_prev_tier text;
  v_crystal_damage int;
  v_status text;
  v_result text;
  v_weak_point_active boolean := false;
  v_roll numeric;
  v_band text;
  v_diff int;
  v_bonus_q public.questions;
  -- ✅ ใหม่ (Phase 2): wrong streak + chosen_warrior
  v_wrong_streak int := 0;
  v_cw_trigger boolean := false;
  v_streak_n int;
  v_cw_criterion text;
  v_cw_stat text;
  v_cw_chosen uuid;
  v_cw_value numeric;
  v_cw_name text;
  v_cw_q public.questions;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_existing from public.boss_raid_answers
  where participant_id = p_participant_id and question_id = p_question_id
    and question_started_at = p_question_started_at;
  if found then
    select boss_hp, crystal_hp, current_tier, status, result
      into v_boss_hp, v_crystal_hp, v_cur_tier, v_status, v_result
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null,
      'status', v_status, 'result', v_result);
  end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  -- ✅ Phase 2: chosen_warrior กำลังทำงาน -> freeze คำถามปกติทั้งห้อง
  --   คนที่ถูกเลือกต้องใช้ submit_chosen_warrior_answer; คนอื่นตอบปกติไม่ได้ระหว่างนี้
  if coalesce(v_s.active_event ->> 'type', '') = 'chosen_warrior' then
    return jsonb_build_object('frozen', true, 'is_correct', null, 'is_crit', false,
      'damage_dealt', 0, 'boss_hp', v_s.boss_hp, 'crystal_hp', v_s.crystal_hp,
      'current_tier', v_s.current_tier, 'crystal_damage', null,
      'status', v_s.status, 'result', v_s.result);
  end if;

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
    v_is_correct := (v_ans = v_q.correct_index::text)
                    or (v_ans <> '' and v_ans = (v_q.choices ->> v_q.correct_index));
  end if;

  v_weak_point_active := (
    v_s.active_event ->> 'type' = 'weak_point'
    and (v_s.active_event ->> 'expires_at')::timestamptz > now()
  );

  if v_is_correct then
    v_atk := coalesce((v_p.stat_snapshot->>'atk')::numeric, 0);
    v_foc := coalesce((v_p.stat_snapshot->>'foc')::numeric, 0);
    v_damage := round(10 * (v_atk / 100));
    v_crit_chance := least(50, round(v_foc / 2)::int);
    v_is_crit := (floor(random() * 100) < v_crit_chance);
    if v_is_crit then v_damage := round(v_damage * 1.5); end if;
    if v_weak_point_active then v_damage := v_damage * 2; end if;
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
    select boss_hp, crystal_hp, current_tier, status, result
      into v_boss_hp, v_crystal_hp, v_cur_tier, v_status, v_result
      from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp,
      'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier, 'crystal_damage', null,
      'status', v_status, 'result', v_result);
  end if;

  v_prev_tier := v_s.current_tier;

  if v_is_correct and v_damage > 0 then
    update public.boss_raid_sessions set boss_hp = greatest(0, coalesce(boss_hp,0) - v_damage)
      where id = v_p.session_id
      returning boss_hp, crystal_hp, current_tier into v_boss_hp, v_crystal_hp, v_cur_tier;

  elsif not v_is_correct then
    case v_config->>'difficulty'
      when 'easy' then v_base_t1 := 10; v_base_t2 := 20;
      when 'hard' then v_base_t1 := 5;  v_base_t2 := 10;
      else             v_base_t1 := 7;  v_base_t2 := 14;
    end case;

    v_n  := greatest(coalesce(v_s.participant_count_at_start, 15), 1);
    v_t1 := greatest(1, round(v_base_t1 * v_n / 15.0)::int);
    v_t2 := greatest(v_t1 + 1, round(v_base_t2 * v_n / 15.0)::int);

    update public.boss_raid_sessions
      set wrong_count_total = wrong_count_total + 1
      where id = v_p.session_id
      returning wrong_count_total, current_tier,
               coalesce((avg_stat_snapshot->>'def')::numeric, 0)
      into v_wrong_new, v_cur_tier, v_avg_def;

    v_target_rank := case when v_wrong_new >= v_t2 then 3
                          when v_wrong_new >= v_t1 then 2
                          else 1 end;
    v_new_rank := greatest(
      v_target_rank,
      case v_cur_tier when 'heavy' then 3 when 'medium' then 2 else 1 end
    );
    v_new_tier := case v_new_rank when 3 then 'heavy' when 2 then 'medium' else 'light' end;

    v_crystal_damage := round(
      v_new_rank * (100.0 / coalesce(nullif(v_avg_def, 0), 100))
    )::int;

    if v_new_tier <> v_cur_tier then
      insert into public.boss_raid_tier_log (session_id, tier) values (v_p.session_id, v_new_tier);
    end if;

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

  v_status := v_s.status;
  if v_is_correct and v_damage > 0 and v_boss_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  elsif (not v_is_correct) and v_crystal_hp = 0 and v_s.status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'lose'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null,
        total_damage = total_damage + v_damage
    where id = p_participant_id;

  -- ✅ Phase 2: wrong streak bookkeeping — reset 0 ทุกครั้งที่ตอบถูก, +1 ทุกครั้งที่ผิด/timeout
  if v_is_correct then
    update public.boss_raid_sessions set wrong_streak_current = 0 where id = v_p.session_id;
    v_wrong_streak := 0;
  else
    update public.boss_raid_sessions set wrong_streak_current = wrong_streak_current + 1
      where id = v_p.session_id
      returning wrong_streak_current into v_wrong_streak;
  end if;

  -- ✅ Phase 2: chosen_warrior trigger (deterministic) — เช็คก่อน weak_point/meteor roll,
  --   เฉพาะตอนเกมยังไม่จบ + ไม่มี event ทำงานอยู่
  if v_status = 'in_progress'
     and coalesce(v_s.active_event ->> 'type', '') <> 'chosen_warrior'
     and (v_s.active_event is null or (v_s.active_event ->> 'expires_at')::timestamptz <= now())
     and not v_is_correct
  then
    -- (a) tier ขยับเข้า "แรง" ครั้งนี้พอดี  |  (b) ผิดติดกันครบ N
    v_streak_n := case when v_cur_tier = 'light' then coalesce(v_t1, 999) else coalesce(v_t2, 999) end;
    if (v_new_tier = 'heavy' and v_prev_tier <> 'heavy')
       or v_wrong_streak >= v_streak_n
    then
      v_cw_trigger := true;
    end if;
  end if;

  if v_cw_trigger then
    -- reset streak ทันที (กันรีเฟรทันทีในข้อถัดไป)
    update public.boss_raid_sessions set wrong_streak_current = 0 where id = v_p.session_id;

    v_cw_criterion := case when random() < 0.5 then 'single' else 'total' end;
    if v_cw_criterion = 'single' then
      v_cw_stat := (array['atk','def','spd','foc','hp'])[floor(random() * 5) + 1];
    end if;

    -- weighted lottery: น้ำหนัก = ค่า stat ตามเกณฑ์ (linear). Efraimidis–Spirakis:
    --   key = random() ^ (1/weight) — คนที่ key มากสุดชนะ (weight มาก -> key เฉลี่ยสูงกว่า)
    --   ใช้ power() แทน -ln(random()) เพราะ random() อาจเป็น 0 (ln(0) = error)
    with w as (
      select p.id,
        case when v_cw_criterion = 'total'
          then coalesce((p.stat_snapshot->>'hp')::numeric,0) + coalesce((p.stat_snapshot->>'atk')::numeric,0)
             + coalesce((p.stat_snapshot->>'def')::numeric,0) + coalesce((p.stat_snapshot->>'spd')::numeric,0)
             + coalesce((p.stat_snapshot->>'foc')::numeric,0)
          else coalesce((p.stat_snapshot->>v_cw_stat)::numeric, 0)
        end as weight
      from public.boss_raid_participants p
      where p.session_id = v_p.session_id
    )
    select id, weight into v_cw_chosen, v_cw_value
    from w where weight > 0
    order by power(random(), 1.0 / weight) desc
    limit 1;

    if v_cw_chosen is not null then
      -- คำถามพิเศษ — grade_band ของคนที่ถูกเลือก (ตัวแทนห้อง), difficulty ตาม config
      v_diff := case v_config->>'difficulty' when 'easy' then 1 when 'hard' then 3 else 2 end;
      select prof.grade_band into v_band
        from public.boss_raid_participants p
        join public.profiles prof on prof.id = p.user_id
        where p.id = v_cw_chosen;
      v_band := coalesce(v_band, 'junior');

      select q.* into v_cw_q
      from public.questions q
      join public.curriculum_chapters cc
        on cc.subject = q.subject and cc.chapter = q.chapter
       and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
      where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
        and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      order by random() limit 1;

      if found then
        select coalesce(pt.nickname, 'Qmon ของ ' || prof.username) into v_cw_name
          from public.boss_raid_participants p
          join public.pets pt on pt.id = p.pet_id
          join public.profiles prof on prof.id = p.user_id
          where p.id = v_cw_chosen;

        update public.boss_raid_sessions
          set active_event = jsonb_build_object(
            'type', 'chosen_warrior',
            'started_at', now()::text,
            'chosen_participant_id', v_cw_chosen::text,
            'chosen_name', coalesce(v_cw_name, 'ผู้เล่น'),
            'criterion', v_cw_criterion,
            'stat_key', case when v_cw_criterion = 'single' then v_cw_stat else null end,
            'stat_value', round(v_cw_value)::int,
            'question_id', v_cw_q.id,
            'question_text', v_cw_q.question_text,
            'choices', v_cw_q.choices
          )
          where id = v_p.session_id
            and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());

        if found then
          update public.boss_raid_participants
            set current_question_id = v_cw_q.id, question_started_at = now()
            where id = v_cw_chosen;
          insert into public.boss_raid_event_log (session_id, event_type, participant_id)
            values (v_p.session_id, 'chosen_warrior', v_cw_chosen);
        end if;
      end if;
      -- ไม่เจอคำถาม -> ข้ามเงียบๆ (streak reset ไปแล้ว)
    end if;

  -- weak_point / meteor roll เดิม — ข้ามถ้า chosen_warrior trigger
  elsif v_status = 'in_progress' and (
    v_s.active_event is null
    or (v_s.active_event ->> 'expires_at')::timestamptz <= now()
  ) then
    v_roll := random();
    if v_roll < 0.02 then
      update public.boss_raid_sessions
        set active_event = jsonb_build_object(
          'type', 'weak_point', 'expires_at', (now() + interval '20 seconds')::text
        )
        where id = v_p.session_id
          and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());
      if found then
        insert into public.boss_raid_event_log (session_id, event_type) values (v_p.session_id, 'weak_point');
      end if;

    elsif v_roll < 0.04 then
      v_diff := case v_config->>'difficulty' when 'easy' then 1 when 'hard' then 3 else 2 end;
      select grade_band into v_band from public.profiles where id = v_uid;
      v_band := coalesce(v_band, 'junior');

      select q.* into v_bonus_q
      from public.questions q
      join public.curriculum_chapters cc
        on cc.subject = q.subject and cc.chapter = q.chapter
       and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
      where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
        and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      order by random() limit 1;

      if found then
        update public.boss_raid_sessions
          set active_event = jsonb_build_object(
            'type', 'meteor',
            'question_id', v_bonus_q.id,
            'question_text', v_bonus_q.question_text,
            'choices', v_bonus_q.choices,
            'expires_at', (now() + interval '15 seconds')::text,
            'winner_participant_id', null
          )
          where id = v_p.session_id
            and (active_event is null or (active_event->>'expires_at')::timestamptz <= now());
        if found then
          insert into public.boss_raid_event_log (session_id, event_type) values (v_p.session_id, 'meteor');
        end if;
      end if;
    end if;
  end if;

  if v_result = 'win' then
    perform public.distribute_boss_raid_rewards(v_p.session_id);
  end if;

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp,
    'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier,
    'crystal_damage', v_crystal_damage,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_boss_raid_answer(uuid, bigint, timestamptz, text) to authenticated;

-- ===== 3. submit_chosen_warrior_answer — คนที่ถูกเลือกตอบ (x3 บอส / x2.5 คริสตัล) =====

create or replace function public.submit_chosen_warrior_answer(
  p_participant_id uuid, p_answer text
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
  v_ev jsonb;
  v_ans text := btrim(coalesce(p_answer, ''));
  v_question_id bigint;
  v_q public.questions;
  v_is_correct boolean;
  v_is_crit boolean := false;
  v_atk numeric; v_foc numeric; v_crit_chance int;
  v_damage int := 0;
  v_crystal_damage int := 0;
  v_rank int;
  v_avg_def numeric;
  v_started timestamptz;
  v_boss_hp int;
  v_crystal_hp int;
  v_status text;
  v_result text;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมจบแล้ว'; end if;

  v_ev := v_s.active_event;
  if coalesce(v_ev ->> 'type', '') <> 'chosen_warrior' then
    return jsonb_build_object('event_active', false);
  end if;
  if (v_ev ->> 'chosen_participant_id') <> p_participant_id::text then
    return jsonb_build_object('event_active', true, 'not_chosen', true);
  end if;

  v_question_id := (v_ev ->> 'question_id')::bigint;
  select * into v_q from public.questions where id = v_question_id;
  v_is_correct := (v_ans = v_q.correct_index::text)
                  or (v_ans <> '' and v_ans = (v_q.choices ->> v_q.correct_index));

  v_started := coalesce((v_ev ->> 'started_at')::timestamptz, now());

  if v_is_correct then
    v_atk := coalesce((v_p.stat_snapshot->>'atk')::numeric, 0);
    v_foc := coalesce((v_p.stat_snapshot->>'foc')::numeric, 0);
    v_damage := round(10 * (v_atk / 100));
    v_crit_chance := least(50, round(v_foc / 2)::int);
    v_is_crit := (floor(random() * 100) < v_crit_chance);
    if v_is_crit then v_damage := round(v_damage * 1.5); end if;
    v_damage := v_damage * 3;

    -- atomic: เคลียร์ active_event + หักบอส เฉพาะครั้งแรก (กัน double submit)
    update public.boss_raid_sessions
      set boss_hp = greatest(0, coalesce(boss_hp, 0) - v_damage),
          active_event = null
      where id = v_p.session_id and active_event ->> 'type' = 'chosen_warrior'
      returning boss_hp, crystal_hp, status, result
      into v_boss_hp, v_crystal_hp, v_status, v_result;
    if not found then
      return jsonb_build_object('event_active', false, 'already_resolved', true);
    end if;

    update public.boss_raid_participants
      set current_question_id = null, question_started_at = null,
          total_damage = total_damage + v_damage
      where id = p_participant_id;

  else
    v_rank := case v_s.current_tier when 'heavy' then 3 when 'medium' then 2 else 1 end;
    v_avg_def := coalesce(nullif((v_s.avg_stat_snapshot ->> 'def')::numeric, 0), 100);
    v_crystal_damage := round(v_rank * (100.0 / v_avg_def) * 2.5)::int;

    update public.boss_raid_sessions
      set crystal_hp = greatest(0, coalesce(crystal_hp, 0) - v_crystal_damage),
          active_event = null
      where id = v_p.session_id and active_event ->> 'type' = 'chosen_warrior'
      returning boss_hp, crystal_hp, status, result
      into v_boss_hp, v_crystal_hp, v_status, v_result;
    if not found then
      return jsonb_build_object('event_active', false, 'already_resolved', true);
    end if;

    update public.boss_raid_participants
      set current_question_id = null, question_started_at = null
      where id = p_participant_id;
  end if;

  -- log คำตอบ (นับ accuracy ใน summary + trigger animation ฝั่ง TV)
  insert into public.boss_raid_answers
    (session_id, participant_id, question_id, question_started_at, is_correct, is_crit, damage_dealt)
  values (v_p.session_id, p_participant_id, v_question_id, v_started, v_is_correct,
          case when v_is_correct then v_is_crit end,
          case when v_is_correct then v_damage end)
  on conflict (participant_id, question_id, question_started_at) do nothing;

  insert into public.boss_raid_event_log (session_id, event_type, participant_id, bonus_damage)
    values (v_p.session_id, 'chosen_warrior_answer', p_participant_id,
            case when v_is_correct then v_damage else v_crystal_damage end);

  -- freeze จบ: ดัน question_started_at ของคนอื่นไปข้างหน้าเท่าเวลา freeze (คืนเวลาที่เหลือ)
  update public.boss_raid_participants
    set question_started_at = question_started_at + (now() - v_started)
    where session_id = v_p.session_id
      and id <> p_participant_id
      and current_question_id is not null
      and question_started_at is not null;

  -- end-game transitions
  if v_is_correct and v_damage > 0 and v_boss_hp = 0 and v_status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'win'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  elsif (not v_is_correct) and v_crystal_hp = 0 and v_status = 'in_progress' then
    update public.boss_raid_sessions
      set status = 'ended', ended_at = now(), result = 'lose'
      where id = v_p.session_id and status = 'in_progress'
      returning status, result into v_status, v_result;
  end if;

  if v_result = 'win' then
    perform public.distribute_boss_raid_rewards(v_p.session_id);
  end if;

  return jsonb_build_object(
    'event_active', true, 'is_correct', v_is_correct, 'is_crit', v_is_crit,
    'damage_dealt', v_damage, 'crystal_damage', v_crystal_damage,
    'boss_hp', v_boss_hp, 'crystal_hp', v_crystal_hp,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_chosen_warrior_answer(uuid, text) to authenticated;

-- ===== 4. dismiss_boss_raid_event — ครูกดข้าม event (chosen_warrior เท่านั้นในทางปฏิบัติ) =====

create or replace function public.dismiss_boss_raid_event(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_s public.boss_raid_sessions;
  v_ev jsonb;
  v_started timestamptz;
  v_chosen uuid;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_s from public.boss_raid_sessions where id = p_session_id;
  if not found then raise exception 'ไม่พบห้องนี้'; end if;
  if v_s.teacher_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  v_ev := v_s.active_event;
  if v_ev is null then
    return jsonb_build_object('ok', true, 'dismissed', false);
  end if;

  update public.boss_raid_sessions set active_event = null where id = p_session_id;

  if v_ev ->> 'type' = 'chosen_warrior' then
    v_started := coalesce((v_ev ->> 'started_at')::timestamptz, now());
    v_chosen  := nullif(v_ev ->> 'chosen_participant_id', '')::uuid;

    if v_chosen is not null then
      update public.boss_raid_participants
        set current_question_id = null, question_started_at = null
        where id = v_chosen;
    end if;

    update public.boss_raid_participants
      set question_started_at = question_started_at + (now() - v_started)
      where session_id = p_session_id
        and id is distinct from v_chosen
        and current_question_id is not null
        and question_started_at is not null;

    insert into public.boss_raid_event_log (session_id, event_type)
      values (p_session_id, 'chosen_warrior_answer');
  end if;

  return jsonb_build_object('ok', true, 'dismissed', true);
end;
$$;

grant execute on function public.dismiss_boss_raid_event(uuid) to authenticated;

-- ===== 5. get_next_boss_raid_question — คนที่ถูกเลือกได้ข้อพิเศษ, คนอื่น frozen =====

create or replace function public.get_next_boss_raid_question(p_participant_id uuid)
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
  v_band text;
  v_diff int;
  v_timer int;
  v_q public.questions;
  v_started timestamptz;
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_s from public.boss_raid_sessions where id = v_p.session_id;
  if v_s.status <> 'in_progress' then raise exception 'เกมยังไม่เริ่มหรือจบแล้ว'; end if;

  -- ✅ Phase 2: chosen_warrior กำลังทำงาน
  if coalesce(v_s.active_event ->> 'type', '') = 'chosen_warrior' then
    if (v_s.active_event ->> 'chosen_participant_id') = p_participant_id::text then
      -- คนที่ถูกเลือก — คืนข้อพิเศษ (ไม่มี deadline; client ตอบผ่าน submit_chosen_warrior_answer)
      return jsonb_build_object(
        'chosen_warrior', true,
        'question_id', (v_s.active_event ->> 'question_id')::bigint,
        'question_text', v_s.active_event ->> 'question_text',
        'choices', v_s.active_event -> 'choices',
        'image_url', null,
        'criterion', v_s.active_event ->> 'criterion',
        'stat_key', v_s.active_event ->> 'stat_key',
        'stat_value', (v_s.active_event ->> 'stat_value')::int
      );
    end if;
    -- คนอื่น — freeze
    return jsonb_build_object('frozen', true);
  end if;

  v_config := coalesce(v_s.config, '{}'::jsonb);
  v_timer  := coalesce((v_config->>'timer_seconds')::int, 30)
              + round(coalesce((v_p.stat_snapshot->>'spd')::numeric, 0) / 20)::int;

  if v_p.current_question_id is not null
     and v_p.question_started_at is not null
     and now() < v_p.question_started_at + make_interval(secs => v_timer) then
    select * into v_q from public.questions where id = v_p.current_question_id;
    v_started := v_p.question_started_at;
  else
    v_diff := case v_config->>'difficulty' when 'easy' then 1 when 'hard' then 3 else 2 end;
    select grade_band into v_band from public.profiles where id = v_uid;
    v_band := coalesce(v_band, 'junior');

    select q.* into v_q
    from public.questions q
    join public.curriculum_chapters cc
      on cc.subject = q.subject and cc.chapter = q.chapter
     and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
    where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
      and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      and q.id not in (select question_id from public.boss_raid_answers where participant_id = p_participant_id)
    order by random() limit 1;

    if not found then
      select q.* into v_q
      from public.questions q
      join public.curriculum_chapters cc
        on cc.subject = q.subject and cc.chapter = q.chapter
       and coalesce(cc.branch,'') = coalesce(q.branch,'') and cc.grade_band = q.grade_band
      where cc.id in (select jsonb_array_elements_text(coalesce(v_config->'chapter_ids','[]'::jsonb))::bigint)
        and q.status = 'active' and q.grade_band = v_band and q.difficulty = v_diff
      order by random() limit 1;
    end if;

    if not found then raise exception 'ไม่มีคำถามที่ตรงกับบท/ระดับที่ตั้งไว้'; end if;

    v_started := now();
    update public.boss_raid_participants
      set current_question_id = v_q.id, question_started_at = v_started
      where id = p_participant_id;
  end if;

  return jsonb_build_object(
    'question_id', v_q.id,
    'question_text', v_q.question_text,
    'choices', v_q.choices,
    'image_url', v_q.image_url,
    'question_started_at', v_started,
    'deadline', v_started + make_interval(secs => v_timer),
    'personal_timer_seconds', v_timer
  );
end;
$$;

grant execute on function public.get_next_boss_raid_question(uuid) to authenticated;

commit;

-- ============================================================
-- Rollback:
--   re-apply 20260902180000_boss_raid_phase_1_rewards.sql (submit_boss_raid_answer)
--   re-apply 20260829221946_boss_raid_phase_0_3_quiz_loop.sql (get_next_boss_raid_question)
--   drop function submit_chosen_warrior_answer(uuid, text);
--   drop function dismiss_boss_raid_event(uuid);
--   alter table boss_raid_event_log drop constraint boss_raid_event_log_event_type_check,
--     add constraint boss_raid_event_log_event_type_check
--     check (event_type in ('weak_point','meteor','meteor_attempt'));
--   alter table boss_raid_sessions drop column wrong_streak_current;
-- ============================================================
