-- Guardian Phase 5a: plan queue becomes per-subject.
--   1) guardian_plan_chapters gets subject/branch; "current" is unique per (plan_id, subject)
--   2) guardian_create_plan: per-subject queue_order + carries over chapters passed in the old active plan
--   3) guardian_advance_plan_if_passed: evaluates/advances every current row (one per subject) independently
--   4) guardian_set_plan_chapter_queue: kept consistent with the per-subject model (it inserts rows and
--      assumed a single current, so it would break on the NOT NULL subject column otherwise)
--   5) guardian_get_day_breakdown: adds chapter_key to the output (DROP + CREATE)
-- guardian_advance_plan_if_passed keeps its return columns => CREATE OR REPLACE is enough.

-- ============================================================
-- 1) Schema
-- ============================================================
alter table public.guardian_plan_chapters add column if not exists subject text;
alter table public.guardian_plan_chapters add column if not exists branch text;

update public.guardian_plan_chapters gpc
set subject = cc.subject, branch = cc.branch
from public.curriculum_chapters cc
where cc.chapter_key = gpc.chapter_key and gpc.subject is null;

alter table public.guardian_plan_chapters alter column subject set not null;

create unique index if not exists guardian_plan_chapters_one_current_per_subject
  on public.guardian_plan_chapters (plan_id, subject)
  where (status = 'current');

-- Existing plans only have one current for the whole plan: give every other subject its own current
-- (first pending by queue_order) so those subjects start advancing too.
update public.guardian_plan_chapters gpc
set status = 'current', entered_current_at = now()
where gpc.id in (
  select distinct on (p.plan_id, p.subject) p.id
  from public.guardian_plan_chapters p
  join public.guardian_plan gp on gp.id = p.plan_id and gp.status = 'active'
  where p.status = 'pending'
    and not exists (
      select 1 from public.guardian_plan_chapters c
      where c.plan_id = p.plan_id and c.subject = p.subject and c.status = 'current'
    )
  order by p.plan_id, p.subject, p.queue_order
);

comment on column public.guardian_plan_chapters.subject is
  'denormalized from curriculum_chapters at insert time; current is unique per (plan_id, subject)';

-- ============================================================
-- 2) guardian_create_plan
-- ============================================================
create or replace function public.guardian_create_plan(
  p_student_id uuid,
  p_framework text,
  p_duration_weeks integer,
  p_chapter_keys text[],
  p_exam_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id uuid;
  v_bad_key text;
  v_old_passed jsonb;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์สร้างแผนให้นักเรียนคนนี้';
  end if;

  if p_framework not in ('school', 'weak_spot', 'exam_prep') then
    raise exception 'framework ไม่ถูกต้อง';
  end if;

  if p_duration_weeks not in (4, 8, 12) then
    raise exception 'duration_weeks ต้องเป็น 4, 8 หรือ 12';
  end if;

  if p_framework = 'exam_prep' and (p_exam_date is null or p_exam_date <= current_date) then
    raise exception 'exam_prep ต้องระบุ exam_date ที่เป็นอนาคต';
  end if;

  if p_chapter_keys is null or array_length(p_chapter_keys, 1) is null then
    raise exception 'ต้องเลือกอย่างน้อย 1 บทเรียน';
  end if;

  if (select count(distinct ck) from unnest(p_chapter_keys) ck) <> array_length(p_chapter_keys, 1) then
    raise exception 'chapter_key ซ้ำกันในคิว';
  end if;

  select ck into v_bad_key
  from unnest(p_chapter_keys) ck
  where not exists (select 1 from public.curriculum_chapters cc where cc.chapter_key = ck)
  limit 1;

  if v_bad_key is not null then
    raise exception 'chapter_key ไม่ถูกต้อง: %', v_bad_key;
  end if;

  -- chapters already passed in the current active plan: chapter_key -> passed_at (read before replacing)
  select coalesce(jsonb_object_agg(gpc.chapter_key, coalesce(gpc.passed_at, now())), '{}'::jsonb)
    into v_old_passed
  from public.guardian_plan gp
  join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
  where gp.student_id = p_student_id and gp.status = 'active' and gpc.status = 'passed';

  update public.guardian_plan
  set status = 'replaced', replaced_at = now()
  where student_id = p_student_id and status = 'active';

  insert into public.guardian_plan (guardian_id, student_id, framework, duration_weeks, exam_date)
  values (
    v_uid, p_student_id, p_framework, p_duration_weeks,
    case when p_framework = 'exam_prep' then p_exam_date else null end
  )
  returning id into v_plan_id;

  -- queue_order restarts at 0 per subject; first non-passed chapter of each subject becomes current
  insert into public.guardian_plan_chapters
    (plan_id, chapter_key, subject, branch, queue_order, status, entered_current_at, passed_at)
  with ordered as (
    select
      k.ck, cc.subject, cc.branch,
      (row_number() over (partition by cc.subject order by k.ord) - 1)::int as q,
      (v_old_passed ? k.ck) as was_passed
    from unnest(p_chapter_keys) with ordinality as k(ck, ord)
    join public.curriculum_chapters cc on cc.chapter_key = k.ck
  ),
  ranked as (
    select o.*,
      (not o.was_passed) and (row_number() over (partition by o.subject, o.was_passed order by o.q) = 1) as is_first_open
    from ordered o
  )
  select
    v_plan_id, r.ck, r.subject, r.branch, r.q,
    case when r.was_passed then 'passed' when r.is_first_open then 'current' else 'pending' end,
    case when r.is_first_open then now() end,
    case when r.was_passed then (v_old_passed ->> r.ck)::timestamptz end
  from ranked r;

  -- all chapters were already passed => nothing left to do in the new plan
  if not exists (
    select 1 from public.guardian_plan_chapters
    where plan_id = v_plan_id and status in ('pending', 'current')
  ) then
    update public.guardian_plan set status = 'completed' where id = v_plan_id;
  end if;

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, p_student_id, 'view_plan');

  return v_plan_id;
end;
$$;

-- ============================================================
-- 3) guardian_advance_plan_if_passed
-- ============================================================
create or replace function public.guardian_advance_plan_if_passed(p_student_id uuid)
 returns table(affected_chapter_key text, new_status text, promoted_chapter_key text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_total_attempts integer;
  v_recent_correct integer;
  v_recent_count integer;
  v_passed boolean;
  v_stuck boolean;
  v_next_key text;
  v_passed_chapter_count integer;
  v_reward_egg_type_id constant text := 'egg_epic_02'; -- hardcoded per ปอนด์ decision (2026-09-17)
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid <> p_student_id then
    raise exception 'เรียกได้เฉพาะตัวนักเรียนเจ้าของบัญชีเท่านั้น';
  end if;

  select * into v_plan from public.guardian_plan
  where student_id = p_student_id and status = 'active';

  if not found then
    return;
  end if;

  -- one current per subject: evaluate each independently
  for v_current in
    select * from public.guardian_plan_chapters
    where plan_id = v_plan.id and status = 'current'
    order by subject, queue_order
    for update
  loop
    v_passed := false;
    v_stuck := false;

    select * into v_cc from public.curriculum_chapters where chapter_key = v_current.chapter_key;

    select count(*) into v_total_attempts
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = p_student_id
      and qa.source is null
      and q.subject = v_cc.subject
      and (q.branch is not distinct from v_cc.branch)
      and q.grade_band = v_cc.grade_band
      and q.chapter = v_cc.chapter;

    select count(*) filter (where sub.is_correct), count(*)
      into v_recent_correct, v_recent_count
    from (
      select qa.is_correct
      from public.quiz_attempts qa
      join public.questions q on q.id = qa.question_id
      where qa.user_id = p_student_id
        and qa.source is null
        and q.subject = v_cc.subject
        and (q.branch is not distinct from v_cc.branch)
        and q.grade_band = v_cc.grade_band
        and q.chapter = v_cc.chapter
      order by qa.created_at desc
      limit 15
    ) sub;

    if v_total_attempts >= 20 and v_recent_count > 0
       and v_recent_correct::numeric / v_recent_count >= 0.70 then
      v_passed := true;
    elsif v_current.entered_current_at is not null
      and v_current.entered_current_at < now() - interval '14 days' then
      v_stuck := true;
    end if;

    if not v_passed and not v_stuck then
      return query select v_current.chapter_key, v_current.status, null::text;
      continue;
    end if;

    if v_passed then
      update public.guardian_plan_chapters
      set status = 'passed', passed_at = now()
      where id = v_current.id;

      -- "ผ่านทุก 2 บท → ไข่" (§6.1): plan-wide count across subjects, checked on every pass
      select count(*) into v_passed_chapter_count
      from public.guardian_plan_chapters gpc
      where gpc.plan_id = v_plan.id and gpc.status = 'passed';

      if v_passed_chapter_count % 2 = 0 then
        insert into public.player_eggs (user_id, egg_type_id, source)
        values (p_student_id, v_reward_egg_type_id, 'guardian_plan_reward');
      end if;
    else
      update public.guardian_plan_chapters
      set status = 'stuck'
      where id = v_current.id;
    end if;

    -- promote the next pending chapter of the SAME subject only
    select gpc.chapter_key into v_next_key
    from public.guardian_plan_chapters gpc
    where gpc.plan_id = v_plan.id and gpc.subject = v_current.subject and gpc.status = 'pending'
    order by gpc.queue_order
    limit 1;

    if v_next_key is not null then
      update public.guardian_plan_chapters
      set status = 'current', entered_current_at = now()
      where plan_id = v_plan.id and chapter_key = v_next_key;
    end if;

    return query select v_current.chapter_key, (case when v_passed then 'passed' else 'stuck' end), v_next_key;
  end loop;

  -- plan is done once no subject has a current or pending chapter left
  if not exists (
    select 1 from public.guardian_plan_chapters
    where plan_id = v_plan.id and status in ('current', 'pending')
  ) then
    update public.guardian_plan set status = 'completed' where id = v_plan.id;

    perform public.grant_profile_frame(p_student_id, 'guardian_special', 'guardian_plan_complete');
  end if;
end;
$function$;

-- ============================================================
-- 4) guardian_set_plan_chapter_queue — per-subject order + per-subject current
-- ============================================================
create or replace function public.guardian_set_plan_chapter_queue(p_plan_id uuid, p_chapter_keys text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_bad_key text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_plan from public.guardian_plan where id = p_plan_id;

  if not found or v_plan.guardian_id <> v_uid then
    raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
  end if;

  if v_plan.status <> 'active' then
    raise exception 'แก้ไขได้เฉพาะแผนที่ active อยู่';
  end if;

  if p_chapter_keys is null or array_length(p_chapter_keys, 1) is null then
    raise exception 'คิวต้องมีอย่างน้อย 1 บทเรียน';
  end if;

  if (select count(distinct ck) from unnest(p_chapter_keys) ck) <> array_length(p_chapter_keys, 1) then
    raise exception 'chapter_key ซ้ำกันในคิว';
  end if;

  select ck into v_bad_key
  from unnest(p_chapter_keys) ck
  where not exists (select 1 from public.curriculum_chapters cc where cc.chapter_key = ck)
  limit 1;

  if v_bad_key is not null then
    raise exception 'chapter_key ไม่ถูกต้อง: %', v_bad_key;
  end if;

  -- drop non-passed chapters that left the queue (passed = history, untouched here)
  delete from public.guardian_plan_chapters
  where plan_id = p_plan_id
    and status <> 'passed'
    and chapter_key <> all (p_chapter_keys);

  -- add new chapters as pending; existing ones (incl. passed) are skipped by on conflict
  insert into public.guardian_plan_chapters (plan_id, chapter_key, subject, branch, queue_order, status)
  select p_plan_id, k.ck, cc.subject, cc.branch, 0, 'pending'
  from unnest(p_chapter_keys) k(ck)
  join public.curriculum_chapters cc on cc.chapter_key = k.ck
  on conflict (plan_id, chapter_key) do nothing;

  -- queue_order per subject, in the order received (non-passed rows only)
  update public.guardian_plan_chapters gpc
  set queue_order = o.q
  from (
    select k.ck, (row_number() over (partition by cc.subject order by k.ord) - 1)::int as q
    from unnest(p_chapter_keys) with ordinality as k(ck, ord)
    join public.curriculum_chapters cc on cc.chapter_key = k.ck
  ) o
  where gpc.plan_id = p_plan_id and gpc.chapter_key = o.ck and gpc.status <> 'passed';

  -- any subject left without a current (current removed, or subject newly added): promote its first pending
  update public.guardian_plan_chapters gpc
  set status = 'current', entered_current_at = now()
  where gpc.id in (
    select distinct on (p.subject) p.id
    from public.guardian_plan_chapters p
    where p.plan_id = p_plan_id and p.status = 'pending'
      and not exists (
        select 1 from public.guardian_plan_chapters c
        where c.plan_id = p_plan_id and c.subject = p.subject and c.status = 'current'
      )
    order by p.subject, p.queue_order
  );

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, v_plan.student_id, 'view_plan');
end;
$$;

-- ============================================================
-- 5) guardian_get_day_breakdown — add chapter_key (no dependents/other references checked on prod)
-- ============================================================
drop function if exists public.guardian_get_day_breakdown(uuid, date);

create function public.guardian_get_day_breakdown(
  p_student_id uuid,
  p_day date
)
returns table(subject text, branch text, chapter text, correct_count int, total_count int, accuracy numeric, chapter_key text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;
  if not exists (
    select 1 from public.guardian_links gl
    where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  return query
  select
    cc.subject,
    cc.branch,
    cc.chapter,
    (count(*) filter (where qa.is_correct))::int,
    count(*)::int,
    round(count(*) filter (where qa.is_correct)::numeric / count(*) * 100, 0),
    cc.chapter_key
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  join public.curriculum_chapters cc
    on cc.subject = q.subject and (cc.branch is not distinct from q.branch)
   and cc.grade_band = q.grade_band and cc.chapter = q.chapter
  where qa.user_id = p_student_id
    and qa.created_at >= (p_day::timestamp at time zone 'Asia/Bangkok')
    and qa.created_at <  ((p_day + 1)::timestamp at time zone 'Asia/Bangkok')
  group by cc.subject, cc.branch, cc.chapter, cc.chapter_order, cc.chapter_key
  order by cc.subject, cc.chapter_order;
end;
$$;

revoke all on function public.guardian_get_day_breakdown(uuid, date) from public, anon;
grant execute on function public.guardian_get_day_breakdown(uuid, date) to authenticated, service_role;
