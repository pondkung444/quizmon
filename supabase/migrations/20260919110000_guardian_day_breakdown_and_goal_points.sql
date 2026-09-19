-- Guardian Overview Phase 2 backend additions. Two NEW read-only RPCs; no existing function modified.

-- 1) Drill-in for one day: subject + chapter breakdown. Counts ALL activity modes (no qa.source
--    filter, same as guardian_get_daily_trend) and has NO minimum-sample threshold (single day).
create or replace function public.guardian_get_day_breakdown(
  p_student_id uuid,
  p_day date
)
returns table(subject text, branch text, chapter text, correct_count int, total_count int, accuracy numeric)
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
    round(count(*) filter (where qa.is_correct)::numeric / count(*) * 100, 0)
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  join public.curriculum_chapters cc
    on cc.subject = q.subject and (cc.branch is not distinct from q.branch)
   and cc.grade_band = q.grade_band and cc.chapter = q.chapter
  where qa.user_id = p_student_id
    and qa.created_at >= (p_day::timestamp at time zone 'Asia/Bangkok')
    and qa.created_at <  ((p_day + 1)::timestamp at time zone 'Asia/Bangkok')
  group by cc.subject, cc.branch, cc.chapter, cc.chapter_order
  order by cc.subject, cc.chapter_order;
end;
$$;

-- 2) Raw numbers for the consistency-goal progress bar. guardian_get_goal_progress only returns the
--    5-band bucket (+ question counts), not total_points / computed_target, so the hero cannot show
--    "292 / ~350 points" without this. Same points logic as guardian_get_goal_progress.
create or replace function public.guardian_get_goal_points(p_student_id uuid)
returns table(has_goal boolean, level text, total_points int, computed_target int)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_goal public.guardian_goal;
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
$$;

revoke all on function public.guardian_get_day_breakdown(uuid, date) from public, anon;
revoke all on function public.guardian_get_goal_points(uuid) from public, anon;
grant execute on function public.guardian_get_day_breakdown(uuid, date) to authenticated;
grant execute on function public.guardian_get_goal_points(uuid) to authenticated;
