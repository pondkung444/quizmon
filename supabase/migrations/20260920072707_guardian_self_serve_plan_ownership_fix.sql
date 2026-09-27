alter table public.guardian_plan alter column guardian_id drop not null;

create or replace function public.guardian_create_plan(
  p_student_id uuid,
  p_framework text,
  p_duration_weeks integer,
  p_chapter_keys text[],
  p_exam_date date default null::date
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan_id uuid;
  v_bad_key text;
  v_old_passed jsonb;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์สร้างแผนให้นักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links
      where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์สร้างแผนให้นักเรียนคนนี้';
    end if;
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
    case when v_uid = p_student_id then null else v_uid end,
    p_student_id, p_framework, p_duration_weeks,
    case when p_framework = 'exam_prep' then p_exam_date else null end
  )
  returning id into v_plan_id;

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

  if not exists (
    select 1 from public.guardian_plan_chapters
    where plan_id = v_plan_id and status in ('pending', 'current')
  ) then
    update public.guardian_plan set status = 'completed' where id = v_plan_id;
  end if;

  if v_uid <> p_student_id then
    insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
    values (v_uid, p_student_id, 'view_plan');
  end if;

  return v_plan_id;
end;
$function$;

create or replace function public.guardian_set_plan_chapter_queue(
  p_plan_id uuid,
  p_chapter_keys text[]
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_bad_key text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_plan from public.guardian_plan where id = p_plan_id;

  if not found then
    raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
  end if;

  if v_plan.guardian_id is not null then
    if v_plan.guardian_id <> v_uid then
      raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
    end if;
  else
    if v_plan.student_id <> v_uid then
      raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
    end if;
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = v_uid and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
    end if;
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

  delete from public.guardian_plan_chapters
  where plan_id = p_plan_id
    and status <> 'passed'
    and chapter_key <> all (p_chapter_keys);

  insert into public.guardian_plan_chapters (plan_id, chapter_key, subject, branch, queue_order, status)
  select p_plan_id, k.ck, cc.subject, cc.branch, 0, 'pending'
  from unnest(p_chapter_keys) k(ck)
  join public.curriculum_chapters cc on cc.chapter_key = k.ck
  on conflict (plan_id, chapter_key) do nothing;

  update public.guardian_plan_chapters gpc
  set queue_order = o.q
  from (
    select k.ck, (row_number() over (partition by cc.subject order by k.ord) - 1)::int as q
    from unnest(p_chapter_keys) with ordinality as k(ck, ord)
    join public.curriculum_chapters cc on cc.chapter_key = k.ck
  ) o
  where gpc.plan_id = p_plan_id and gpc.chapter_key = o.ck and gpc.status <> 'passed';

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

  if v_uid <> v_plan.student_id then
    insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
    values (v_uid, v_plan.student_id, 'view_plan');
  end if;
end;
$function$;
