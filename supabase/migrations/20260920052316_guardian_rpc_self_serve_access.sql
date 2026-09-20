-- Self-serve pilot: เพิ่ม self-access branch (auth.uid() = p_student_id + self_serve_enrollment
-- active + ยังไม่หมดอายุ) ให้ 14 guardian RPC โดยไม่แตะพฤติกรรมฝั่ง guardian เดิมเลย
-- (ทุกฟังก์ชัน CREATE OR REPLACE, signature เดิมทุกตัว)

CREATE OR REPLACE FUNCTION public.guardian_get_plan(p_student_id uuid)
 RETURNS TABLE(plan_id uuid, framework text, duration_weeks integer, exam_date date, plan_status text, plan_created_at timestamp with time zone, chapter_key text, subject text, branch text, chapter text, chapter_queue_order integer, chapter_status text, entered_current_at timestamp with time zone, passed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงแผนของนักเรียนคนนี้';
    end if;
  elsif not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงแผนของนักเรียนคนนี้';
  end if;

  return query
  select
    gp.id, gp.framework, gp.duration_weeks, gp.exam_date, gp.status, gp.created_at,
    gpc.chapter_key, cc.subject, cc.branch, cc.chapter, gpc.queue_order, gpc.status,
    gpc.entered_current_at, gpc.passed_at
  from public.guardian_plan gp
  left join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
  left join public.curriculum_chapters cc on cc.chapter_key = gpc.chapter_key
  where gp.student_id = p_student_id and gp.status = 'active'
  order by gpc.queue_order nulls last;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_available_chapters(p_student_id uuid)
 RETURNS TABLE(chapter_key text, subject text, branch text, chapter text, chapter_order integer, question_count integer, is_available boolean, recent_attempts integer, recent_accuracy numeric, already_in_active_plan boolean, grade_level text, grade_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_grade_band text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  elsif not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  select p.grade_band into v_grade_band from public.profiles p where p.id = p_student_id;

  if v_grade_band is null then
    raise exception 'ไม่พบข้อมูลระดับชั้นของนักเรียนคนนี้';
  end if;

  return query
  select
    cc.chapter_key,
    cc.subject,
    cc.branch,
    cc.chapter,
    cc.chapter_order,
    coalesce(cca.question_count, 0)::integer,
    coalesce(cca.is_available, false),
    coalesce(stats.attempts, 0)::integer as recent_attempts,
    stats.accuracy as recent_accuracy,
    exists (
      select 1 from public.guardian_plan gp
      join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
      where gp.student_id = p_student_id and gp.status = 'active' and gpc.chapter_key = cc.chapter_key
    ) as already_in_active_plan,
    cc.grade_level,
    cc.grade_order
  from public.curriculum_chapters cc
  join public.curriculum_chapter_availability cca
    on cca.chapter = cc.chapter and cca.subject = cc.subject
    and (cca.branch is not distinct from cc.branch) and cca.grade_band = cc.grade_band
  left join lateral (
    select
      count(*)::integer as attempts,
      round(count(*) filter (where qa.is_correct)::numeric / nullif(count(*), 0) * 100, 0) as accuracy
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = p_student_id
      and qa.source is null
      and qa.created_at >= now() - interval '30 days'
      and q.subject = cc.subject
      and (q.branch is not distinct from cc.branch)
      and q.grade_band = cc.grade_band
      and q.chapter = cc.chapter
  ) stats on true
  where cc.grade_band = v_grade_band
  order by cc.subject, cc.chapter_order;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_qmon_display(p_student_id uuid)
 RETURNS TABLE(nickname text, stage integer, subline text, personality text, egg_sprite_prefix text, egg_name_th text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links
      where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  return query
  select p.nickname, p.stage::integer, p.subline, p.personality, e.sprite_prefix, e.name_th
  from public.pets p
  join public.egg_types e on e.id = p.egg_type_id
  where p.user_id = p_student_id and p.is_active = true
  limit 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_weekly_calendar(p_student_id uuid, p_week_start_date date DEFAULT NULL::date)
 RETURNS TABLE(d date, day_points integer, has_data boolean, is_today boolean, is_future boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_today date;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links
      where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  if p_week_start_date is null then
    select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;
  else
    v_week_start := p_week_start_date;
  end if;

  v_today := (now() at time zone 'Asia/Bangkok')::date;

  return query
  select gs.d::date,
    coalesce(pts.day_points, 0) as day_points,
    coalesce(pts.counted_q, 0) > 0 as has_data,
    gs.d::date = v_today as is_today,
    gs.d::date > v_today as is_future
  from generate_series(v_week_start, v_week_start + 6, interval '1 day') as gs(d)
  left join public.guardian_daily_points_bkk(p_student_id, v_week_start) pts
    on pts.d = gs.d::date
  order by gs.d;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_categories(p_student_id uuid)
 RETURNS TABLE(subject text, branch text, chapter_key text, chapter text, answered_count integer, accuracy numeric, tier text, grade_level text, grade_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links
      where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  return query
  select
    cc.subject,
    cc.branch,
    cc.chapter_key,
    cc.chapter,
    count(*)::integer as answered_count,
    round(count(*) filter (where qa.is_correct)::numeric / count(*) * 100, 0) as accuracy,
    case
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.80 then 'คล่องแล้ว'
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.50 then 'กำลังไปได้'
      else 'ยังต้องฝึก'
    end as tier,
    cc.grade_level,
    cc.grade_order
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  join public.curriculum_chapters cc
    on cc.subject = q.subject and (cc.branch is not distinct from q.branch)
    and cc.grade_band = q.grade_band and cc.chapter = q.chapter
  where qa.user_id = p_student_id
    and qa.source is null
    and qa.created_at >= now() - interval '30 days'
  group by cc.chapter_key, cc.subject, cc.branch, cc.chapter, cc.grade_level, cc.grade_order
  having count(*) >= 10
  order by cc.subject, cc.chapter;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_chapter_status_changes(p_student_id uuid)
 RETURNS TABLE(chapter_key text, subject text, chapter text, current_tier text, previous_tier text, answered_count_current integer, changed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  c_min_weekly constant int := 5;
  v_week_start timestamptz;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  select b.week_start into v_week_start from public.current_week_bounds_bkk() b;

  return query
  with per as (
    select
      cc.chapter_key as ck, cc.subject as sj, cc.chapter as ch,
      (qa.created_at >= v_week_start) as is_cur,
      count(*)::int as n,
      count(*) filter (where qa.is_correct)::numeric as c
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    join public.curriculum_chapters cc
      on cc.subject = q.subject and (cc.branch is not distinct from q.branch)
     and cc.grade_band = q.grade_band and cc.chapter = q.chapter
    where qa.user_id = p_student_id
      and qa.source is null
      and qa.created_at >= v_week_start - interval '7 days'
      and qa.created_at <  v_week_start + interval '7 days'
    group by 1, 2, 3, 4
  ),
  cur as (select * from per where is_cur),
  prv as (select * from per where not is_cur),
  joined as (
    select coalesce(cur.ck, prv.ck) as ck, coalesce(cur.sj, prv.sj) as sj,
           coalesce(cur.ch, prv.ch) as ch,
           coalesce(cur.n, 0) as cn, cur.c as cc_, coalesce(prv.n, 0) as pn, prv.c as pc_
    from cur full outer join prv on cur.ck = prv.ck
  ),
  tiered as (
    select j.*,
      case when j.cn < c_min_weekly then null
           when j.cc_ / j.cn >= 0.80 then 'คล่องแล้ว'
           when j.cc_ / j.cn >= 0.50 then 'กำลังไปได้'
           else 'ยังต้องฝึก' end as ct,
      case when j.pn < c_min_weekly then null
           when j.pc_ / j.pn >= 0.80 then 'คล่องแล้ว'
           when j.pc_ / j.pn >= 0.50 then 'กำลังไปได้'
           else 'ยังต้องฝึก' end as pt
    from joined j
  )
  select t.ck, t.sj, t.ch, t.ct, t.pt, t.cn,
         (t.ct is not null and t.pt is not null and t.ct <> t.pt)
  from tiered t
  order by t.sj, t.ch;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_daily_trend(p_student_id uuid, p_end_date date DEFAULT NULL::date, p_days integer DEFAULT 7)
 RETURNS TABLE(d date, correct_count integer, total_count integer, accuracy numeric, has_data boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_end date := coalesce(p_end_date, (now() at time zone 'Asia/Bangkok')::date);
  v_days int := greatest(coalesce(p_days, 7), 1);
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  return query
  with days as (
    select gs::date as day
    from generate_series(v_end - (v_days - 1), v_end, interval '1 day') gs
  ),
  agg as (
    select (qa.created_at at time zone 'Asia/Bangkok')::date as day,
           count(*) filter (where qa.is_correct)::int as cc,
           count(*)::int as tc
    from public.quiz_attempts qa
    where qa.user_id = p_student_id
      and qa.created_at >= ((v_end - (v_days - 1))::timestamp at time zone 'Asia/Bangkok')
      and qa.created_at <  ((v_end + 1)::timestamp at time zone 'Asia/Bangkok')
    group by 1
  )
  select days.day,
         coalesce(agg.cc, 0),
         coalesce(agg.tc, 0),
         round(coalesce(agg.cc, 0)::numeric / nullif(coalesce(agg.tc, 0), 0) * 100, 0),
         coalesce(agg.tc, 0) > 0
  from days left join agg on agg.day = days.day
  order by days.day;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_day_breakdown(p_student_id uuid, p_day date)
 RETURNS TABLE(subject text, branch text, chapter text, correct_count integer, total_count integer, accuracy numeric, chapter_key text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_goal_points(p_student_id uuid)
 RETURNS TABLE(has_goal boolean, level text, total_points integer, computed_target integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_goal public.guardian_goal;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  select b.week_start_date into v_week_start from public.current_week_bounds_bkk() b;

  select * into v_goal from public.guardian_goal g
  where g.student_id = p_student_id and g.week_start = v_week_start;

  if not found then
    return query select false, null::text, 0, null::int;
    return;
  end if;

  return query
  select true, v_goal.level,
         coalesce((select sum(d.day_points) from public.guardian_daily_points_bkk(p_student_id, v_week_start) d), 0)::int,
         v_goal.computed_target;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_subject_comparison(p_student_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(subject text, branch text, answered_count integer, accuracy numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  return query
  select
    cc.subject,
    cc.branch,
    count(*)::int,
    round(count(*) filter (where qa.is_correct)::numeric / count(*) * 100, 0)
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  join public.curriculum_chapters cc
    on cc.subject = q.subject and (cc.branch is not distinct from q.branch)
   and cc.grade_band = q.grade_band and cc.chapter = q.chapter
  where qa.user_id = p_student_id
    and qa.source is null
    and qa.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  group by cc.subject, cc.branch
  having count(*) >= 10
  order by 4 desc, 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_plan_progress(p_student_id uuid)
 RETURNS TABLE(chapter_key text, subject text, branch text, chapter text, attempts_total integer, accuracy_start numeric, accuracy_recent numeric, pass_threshold_attempts integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links gl
      where gl.guardian_id = v_uid and gl.student_id = p_student_id and gl.status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  return query
  with cur as (
    select
      gpc.chapter_key as ck, cc.subject as subj, cc.branch as br, cc.chapter as chap,
      cc.grade_band as gb, coalesce(gpc.entered_current_at, gp.created_at) as since_at
    from public.guardian_plan gp
    join public.guardian_plan_chapters gpc on gpc.plan_id = gp.id
    join public.curriculum_chapters cc on cc.chapter_key = gpc.chapter_key
    where gp.student_id = p_student_id and gp.status = 'active' and gpc.status = 'current'
  ),
  att as (
    select
      c.ck,
      qa.is_correct as ok,
      (qa.created_at >= c.since_at) as is_since,
      row_number() over (partition by c.ck order by qa.created_at desc, qa.id desc) as rn_desc,
      row_number() over (partition by c.ck, (qa.created_at >= c.since_at) order by qa.created_at, qa.id) as rn_since_asc
    from cur c
    join public.quiz_attempts qa
      on qa.user_id = p_student_id and qa.source is null
    join public.questions q
      on q.id = qa.question_id
     and q.subject = c.subj
     and (q.branch is not distinct from c.br)
     and q.grade_band = c.gb
     and q.chapter = c.chap
  ),
  agg as (
    select
      a.ck,
      count(*)::int as total,
      count(*) filter (where a.is_since)::int as since_total,
      count(*) filter (where a.is_since and a.rn_since_asc <= 5 and a.ok) as start_ok,
      count(*) filter (where a.rn_desc <= 15 and a.ok) as recent_ok
    from att a
    group by a.ck
  )
  select
    c.ck, c.subj, c.br, c.chap,
    coalesce(g.total, 0),
    case when coalesce(g.since_total, 0) >= 5 then round(g.start_ok::numeric / 5 * 100, 0) end,
    case when coalesce(g.total, 0) >= 15 then round(g.recent_ok::numeric / 15 * 100, 0) end,
    20
  from cur c
  left join agg g on g.ck = c.ck
  order by c.subj, c.ck;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_get_goal_progress(p_student_id uuid)
 RETURNS TABLE(goal_week_start date, has_goal boolean, goal_level text, bucket text, total_questions integer, total_correct integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_week_start_ts timestamptz;
  v_week_end_ts timestamptz;
  v_goal public.guardian_goal;
  v_total_points integer;
  v_total_q integer;
  v_total_correct integer;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links
      where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
    end if;
  end if;

  select wb.week_start_date, wb.week_start, wb.week_end
  into v_week_start, v_week_start_ts, v_week_end_ts
  from public.current_week_bounds_bkk() wb;

  select count(*)::integer, coalesce(sum((qa.is_correct)::integer), 0)::integer
  into v_total_q, v_total_correct
  from public.quiz_attempts qa
  where qa.user_id = p_student_id
    and qa.source is null
    and qa.created_at >= v_week_start_ts
    and qa.created_at < v_week_end_ts;

  select * into v_goal from public.guardian_goal
  where student_id = p_student_id and week_start = v_week_start;

  if not found then
    return query select v_week_start, false, null::text, null::text, v_total_q, v_total_correct;
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
    end,
    v_total_q,
    v_total_correct;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_set_goal(p_student_id uuid, p_level text)
 RETURNS TABLE(goal_week_start date, goal_level text, goal_computed_target integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if v_uid = p_student_id then
    if not exists (
      select 1 from public.self_serve_enrollment
      where student_id = p_student_id and status = 'active' and now() < expires_at
    ) then
      raise exception 'ไม่มีสิทธิ์ตั้งเป้าหมายให้นักเรียนคนนี้';
    end if;
  else
    if not public.is_guardian_admin(v_uid) then
      raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
    end if;
    if not exists (
      select 1 from public.guardian_links
      where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
    ) then
      raise exception 'ไม่มีสิทธิ์ตั้งเป้าหมายให้นักเรียนคนนี้';
    end if;
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

  if v_uid <> p_student_id then
    insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
    values (v_uid, p_student_id, 'set_goal');
  end if;

  return query select v_week_start, p_level, v_target;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guardian_create_plan(p_student_id uuid, p_framework text, p_duration_weeks integer, p_chapter_keys text[], p_exam_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_uid, p_student_id, p_framework, p_duration_weeks,
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
