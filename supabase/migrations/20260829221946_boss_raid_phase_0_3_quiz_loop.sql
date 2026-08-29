-- Migration: 20260829221946_boss_raid_phase_0_3_quiz_loop
-- Classroom Boss Raid — Phase 0.3 (Core Quiz Loop)
-- อ้างอิง: classroom-boss-raid-design-2026-08-28-v2.md §11 (sub-phase 0.3), §12 (Connection Resilience)
--
-- นักเรียนขอคำถาม -> ตอบ -> ตอบถูกหักเลือดบอส (มีโอกาสคริ), ตอบผิด/timeout นับ wrong_count_total
-- (ยังไม่ trigger tier — 0.4). ทุกอย่างเขียนผ่าน RPC security definer, ไม่มี client write ตรง.
--
-- สูตร (placeholder — จูนด้วย simulator 0.4/0.5):
--   base_damage = 10
--   damage = round(10 * atk_snapshot/100)
--   crit_chance% = least(50, round(foc_snapshot/2)) ; crit_multiplier = 1.5
--   personal_timer_seconds = config.timer_seconds + round(spd_snapshot/20)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.boss_raid_sessions
  add column wrong_count_total integer not null default 0;

alter table public.boss_raid_answers
  add column is_crit boolean,
  add column damage_dealt integer;

comment on column public.boss_raid_sessions.wrong_count_total is
  'จำนวนคำตอบผิด/timeout สะสมทั้งห้อง (Phase 0.3). Phase 0.4 จะใช้ trigger tier.';

-- ============================================================
-- get_next_boss_raid_question(p_participant_id) — ขอข้อถัดไป / resume ข้อค้าง (§12.4)
--   resume-aware: ถ้า current_question_id ยังค้างและยังไม่หมดเวลา -> คืนข้อเดิม ไม่รีเซ็ต started_at
--   (client ไม่ต้องอ่าน public.questions เอง — code path เดียว)
--   exclude คำถามที่ participant ตอบไปแล้วในห้องนี้; ตอบครบค่อยยอมวนซ้ำ
-- ============================================================
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

-- ============================================================
-- submit_boss_raid_answer(participant, question_id, question_started_at, answer)
--   §12.1 idempotent: มีแถวใน boss_raid_answers ตรง (participant,question,started_at) แล้ว -> คืนผลเดิม
--   insert = unique gate; แพ้ race -> คืนผลของ row ที่ชนะ ไม่ apply ดาเมจ/wrong ซ้ำ
--   timeout (server-side now() > started_at + personal_timer) -> ผิดอัตโนมัติ
--   p_answer = index 0-based ของ choice เป็น string ("2") ; รับ choice text ได้ด้วยกัน format พัง
-- ============================================================
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
  v_ans text := btrim(coalesce(p_answer, ''));
begin
  if v_uid is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;

  select * into v_p from public.boss_raid_participants where id = p_participant_id;
  if not found or v_p.user_id <> v_uid then raise exception 'ไม่มีสิทธิ์'; end if;

  select * into v_existing from public.boss_raid_answers
  where participant_id = p_participant_id and question_id = p_question_id
    and question_started_at = p_question_started_at;
  if found then
    select boss_hp into v_boss_hp from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp);
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
    select boss_hp into v_boss_hp from public.boss_raid_sessions where id = v_p.session_id;
    return jsonb_build_object('idempotent', true, 'is_correct', v_existing.is_correct,
      'is_crit', coalesce(v_existing.is_crit,false),
      'damage_dealt', coalesce(v_existing.damage_dealt,0), 'boss_hp', v_boss_hp);
  end if;

  if v_is_correct and v_damage > 0 then
    update public.boss_raid_sessions set boss_hp = greatest(0, coalesce(boss_hp,0) - v_damage)
      where id = v_p.session_id returning boss_hp into v_boss_hp;
  elsif not v_is_correct then
    update public.boss_raid_sessions set wrong_count_total = wrong_count_total + 1
      where id = v_p.session_id returning boss_hp into v_boss_hp;
  else
    select boss_hp into v_boss_hp from public.boss_raid_sessions where id = v_p.session_id;
  end if;

  update public.boss_raid_participants
    set current_question_id = null, question_started_at = null
    where id = p_participant_id;

  return jsonb_build_object('idempotent', false, 'is_correct', v_is_correct,
    'is_crit', v_is_crit, 'damage_dealt', v_damage, 'boss_hp', v_boss_hp);
end;
$$;
grant execute on function public.submit_boss_raid_answer(uuid, bigint, timestamptz, text) to authenticated;

commit;

-- ============================================================
-- Rollback:
-- ============================================================
-- begin;
-- drop function if exists public.submit_boss_raid_answer(uuid, bigint, timestamptz, text);
-- drop function if exists public.get_next_boss_raid_question(uuid);
-- alter table public.boss_raid_answers drop column if exists damage_dealt, drop column if exists is_crit;
-- alter table public.boss_raid_sessions drop column if exists wrong_count_total;
-- commit;
