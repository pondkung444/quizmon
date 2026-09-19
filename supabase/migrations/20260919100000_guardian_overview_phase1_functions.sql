-- Guardian Overview Phase 1: three NEW read-only RPCs. No existing function is modified.

-- 1) Rolling daily trend (7 / 30+ days). Counts ALL activity modes (quiz/PvP/Raid/dungeon),
--    so it intentionally does NOT filter qa.source is null, and does NOT cap 20 q/day.
create or replace function public.guardian_get_daily_trend(
  p_student_id uuid,
  p_end_date date default null,
  p_days int default 7
)
returns table(d date, correct_count int, total_count int, accuracy numeric, has_data boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_end date := coalesce(p_end_date, (now() at time zone 'Asia/Bangkok')::date);
  v_days int := greatest(coalesce(p_days, 7), 1);
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
$$;

-- 2) Subject comparison over the last p_days days (same filters/threshold as guardian_get_categories).
create or replace function public.guardian_get_subject_comparison(
  p_student_id uuid,
  p_days int default 30
)
returns table(subject text, branch text, answered_count int, accuracy numeric)
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
$$;

-- 3) Chapter tier this week vs last week (Mon-Sun, Asia/Bangkok). Returns every chapter with
--    activity in either week; `changed` only when both weeks reach the minimum sample.
--    c_min_weekly is the min answers per chapter per week (PROPOSED = 5, pending Pond's confirm).
create or replace function public.guardian_get_chapter_status_changes(p_student_id uuid)
returns table(
  chapter_key text, subject text, chapter text,
  current_tier text, previous_tier text,
  answered_count_current int, changed boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  c_min_weekly constant int := 5;
  v_week_start timestamptz;
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
$$;

revoke all on function public.guardian_get_daily_trend(uuid, date, int) from public, anon;
revoke all on function public.guardian_get_subject_comparison(uuid, int) from public, anon;
revoke all on function public.guardian_get_chapter_status_changes(uuid) from public, anon;
grant execute on function public.guardian_get_daily_trend(uuid, date, int) to authenticated;
grant execute on function public.guardian_get_subject_comparison(uuid, int) to authenticated;
grant execute on function public.guardian_get_chapter_status_changes(uuid) to authenticated;
