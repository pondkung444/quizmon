begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop function if exists public.guardian_get_goal_progress(uuid);

create function public.guardian_get_goal_progress(p_student_id uuid)
returns table (
  goal_week_start date,
  has_goal boolean,
  goal_level text,
  bucket text
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_goal public.guardian_goal;
  v_total_points integer;
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
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;

  select * into v_goal from public.guardian_goal
  where student_id = p_student_id and week_start = v_week_start;

  if not found then
    return query select v_week_start, false, null::text, null::text;
    return;
  end if;

  select coalesce(sum(d.day_points), 0)::integer into v_total_points
  from public.guardian_daily_points_bkk(p_student_id, v_week_start) d;

  return query
  select
    v_week_start,
    true,
    v_goal.level,
    case
      when v_total_points = 0 then 'ยังไม่เริ่ม'
      when v_total_points::numeric / v_goal.computed_target < 0.40 then 'เริ่มแล้ว'
      when v_total_points::numeric / v_goal.computed_target < 0.70 then 'ไปได้ดี'
      when v_total_points::numeric / v_goal.computed_target < 1.00 then 'เกือบถึงแล้ว'
      else 'ถึงเป้าแล้ว'
    end;
end;
$$;

drop function if exists public.guardian_set_goal(uuid, text);

create function public.guardian_set_goal(p_student_id uuid, p_level text)
returns table (goal_week_start date, goal_level text, goal_computed_target integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_grade_band text;
  v_points integer[] := array[]::integer[];
  v_candidate_week date;
  v_week_points integer;
  v_median numeric;
  v_multiplier numeric;
  v_target integer;
  v_weeks_found integer := 0;
  i integer;
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
    raise exception 'ไม่มีสิทธิ์ตั้งเป้าหมายให้นักเรียนคนนี้';
  end if;

  if p_level not in ('relaxed', 'steady', 'challenging') then
    raise exception 'level ไม่ถูกต้อง';
  end if;

  select p.grade_band into v_grade_band from public.profiles p where p.id = p_student_id;

  select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;

  for i in 1..8 loop
    exit when v_weeks_found >= 4;
    v_candidate_week := v_week_start - (7 * i);

    select ws.total_points into v_week_points
    from public.weekly_scores_bkk_for_week(v_candidate_week, v_grade_band) ws
    where ws.user_id = p_student_id;

    if found then
      v_points := array_append(v_points, v_week_points);
      v_weeks_found := v_weeks_found + 1;
    end if;
  end loop;

  if v_weeks_found < 2 then
    v_target := case p_level
      when 'relaxed' then 60
      when 'steady' then 80
      else 100
    end;
  else
    select percentile_cont(0.5) within group (order by v)
    into v_median
    from unnest(v_points) v;

    v_multiplier := case p_level
      when 'relaxed' then 1.0
      when 'steady' then 1.3
      else 1.6
    end;

    v_target := greatest(40, least(300, round(v_median * v_multiplier)::integer));
  end if;

  insert into public.guardian_goal (student_id, level, week_start, computed_target)
  values (p_student_id, p_level, v_week_start, v_target)
  on conflict (student_id, week_start)
  do update set level = excluded.level, computed_target = excluded.computed_target;

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, p_student_id, 'set_goal');

  return query select v_week_start, p_level, v_target;
end;
$$;

drop function if exists public.guardian_advance_plan_if_passed(uuid);

create function public.guardian_advance_plan_if_passed(p_student_id uuid)
returns table (affected_chapter_key text, new_status text, promoted_chapter_key text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_total_attempts integer;
  v_recent_correct integer;
  v_recent_count integer;
  v_passed boolean := false;
  v_stuck boolean := false;
  v_next_key text;
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

  select * into v_current from public.guardian_plan_chapters
  where plan_id = v_plan.id and status = 'current';

  if not found then
    return;
  end if;

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

  if v_passed then
    update public.guardian_plan_chapters
    set status = 'passed', passed_at = now()
    where id = v_current.id;
  elsif v_stuck and v_current.status <> 'stuck' then
    update public.guardian_plan_chapters
    set status = 'stuck'
    where id = v_current.id;
  else
    return query select v_current.chapter_key, v_current.status, null::text;
    return;
  end if;

  select gpc.chapter_key into v_next_key
  from public.guardian_plan_chapters gpc
  where gpc.plan_id = v_plan.id and gpc.status = 'pending'
  order by gpc.queue_order
  limit 1;

  if v_next_key is not null then
    update public.guardian_plan_chapters
    set status = 'current', entered_current_at = now()
    where plan_id = v_plan.id and chapter_key = v_next_key;
  else
    update public.guardian_plan
    set status = 'completed'
    where id = v_plan.id;
  end if;

  return query select v_current.chapter_key, (case when v_passed then 'passed' else 'stuck' end), v_next_key;
end;
$$;

commit;
