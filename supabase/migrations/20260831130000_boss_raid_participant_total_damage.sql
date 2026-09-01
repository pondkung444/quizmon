-- Migration: 20260831130000_boss_raid_participant_total_damage
-- Classroom Boss Raid — Phase 1 สไลซ์ 1.1-UI-a: per-participant total_damage (ranking / party formation)
-- อ้างอิง: classroom-boss-raid-design-2026-08-28-v2.md §4
--
-- boss_raid_participants.total_damage = ผลรวมดาเมจที่ผู้เล่นคนนี้ตีเข้า boss_hp จากการตอบคำถาม "ปกติ"
--   นับ: ดาเมจปกติ + ดาเมจ x2 จากจุดอ่อนเผย (weak_point) — เพราะทั้งคู่หัก boss_hp ผ่าน v_damage
--   ไม่นับ: +15 ฝนดาวตก (submit_boss_raid_event_answer) — คนละ RPC, เป็นดาเมจ event ไม่ใช่ผลการตอบของ party
--
-- แก้ submit_boss_raid_answer() 1 บรรทัด: final participant UPDATE (run ทุก path) เพิ่ม
--   total_damage = total_damage + v_damage  (v_damage = 0 เองเมื่อตอบผิด/timeout/ไม่ crit-นับ 0)
-- body ที่เหลือ = ก็อปจาก 20260831120000_boss_raid_phase_1_events.sql เป๊ะ · signature ไม่เปลี่ยน

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.boss_raid_participants
  add column if not exists total_damage int not null default 0;

comment on column public.boss_raid_participants.total_damage is
  'ผลรวมดาเมจที่ผู้เล่นตีเข้า boss_hp จากการตอบคำถามปกติ (รวม x2 จุดอ่อนเผย, ไม่รวม +15 ฝนดาวตก). '
  'ใช้จัดอันดับ / party formation. เขียนผ่าน submit_boss_raid_answer เท่านั้น.';

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
  v_crystal_damage int;
  v_status text;
  v_result text;
  v_weak_point_active boolean := false;
  v_roll numeric;
  v_band text;
  v_diff int;
  v_bonus_q public.questions;
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

  -- ✅ 1.1-UI-a: สะสม total_damage (v_damage = 0 เองตอนตอบผิด/timeout) — จุดเดียว, run ทุก path
  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null,
        total_damage = total_damage + v_damage
    where id = p_participant_id;

  if v_status = 'in_progress' and (
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

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp,
    'crystal_hp', v_crystal_hp, 'current_tier', v_cur_tier,
    'crystal_damage', v_crystal_damage,
    'status', coalesce(v_status, v_s.status), 'result', v_result);
end;
$$;

grant execute on function public.submit_boss_raid_answer(uuid, bigint, timestamptz, text) to authenticated;

commit;

-- ============================================================
-- Rollback: re-apply 20260831120000_boss_raid_phase_1_events.sql's submit_boss_raid_answer
--   (final participant UPDATE ไม่มี total_damage); ALTER TABLE boss_raid_participants DROP COLUMN total_damage
-- ============================================================
