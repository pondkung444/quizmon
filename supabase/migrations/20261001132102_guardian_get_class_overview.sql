-- guardian_get_class_overview: ภาพรวมของ "นักเรียนทุกคนที่ผู้ปกครอง/ครูคนนี้ดูแล" ในการเรียก RPC ครั้งเดียว
-- (หน้าแรก /guardian) — แทนการเรียก RPC รายคน ~8 ตัว x จำนวนเด็ก
--
-- นับเฉพาะ main loop (quiz_attempts.source is null) เหมือน guardian_get_goal_progress / plan pass gate
-- วันตามเวลาไทย (Asia/Bangkok) · p_grade = กรองระดับชั้น (เช่น 'ม.2') null = ทุกชั้น
-- สิทธิ์: ต้องอยู่ใน guardian_admin และเห็นเฉพาะเด็กที่ guardian_links.status = 'claimed' กับตัวเอง
--
-- เกณฑ์สถานะรายคน (status):
--   gone = ไม่เคยเล่น หรือเว้นว่าง >= 3 วัน (ไม่นับวันนี้)
--   low  = 7 วันล่าสุดตอบ >= 10 ข้อ และแม่น < 40%
--   ok   = นอกนั้น
create or replace function public.guardian_get_class_overview(p_grade text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_start timestamptz;
  v_week_start date;
  v_students jsonb;
  v_daily jsonb;
  v_compare jsonb;
  v_good jsonb;
  v_bad jsonb;
  v_grades jsonb;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  v_start := ((v_today - 13)::timestamp at time zone 'Asia/Bangkok');
  select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;

  -- ระดับชั้นที่มีในกลุ่มนี้ (ไม่ถูกกรอง) ไว้ทำ chip กรอง
  select coalesce(jsonb_agg(g.grade_level order by g.grade_level), '[]'::jsonb) into v_grades
  from (
    select distinct p.grade_level
    from public.guardian_links gl
    join public.profiles p on p.id = gl.student_id
    where gl.guardian_id = v_uid and gl.status = 'claimed' and p.grade_level is not null
  ) g;

  -- รายคน
  with linked as (
    select p.id, p.username, p.grade_level
    from public.guardian_links gl
    join public.profiles p on p.id = gl.student_id
    where gl.guardian_id = v_uid and gl.status = 'claimed'
      and (p_grade is null or p.grade_level = p_grade)
  ),
  a as (
    select qa.user_id, (qa.created_at at time zone 'Asia/Bangkok')::date as d, qa.is_correct
    from public.quiz_attempts qa
    join linked l on l.id = qa.user_id
    where qa.source is null and qa.created_at >= v_start
  ),
  last_play as (
    select qa.user_id, max((qa.created_at at time zone 'Asia/Bangkok')::date) as d
    from public.quiz_attempts qa
    join linked l on l.id = qa.user_id
    where qa.source is null
    group by qa.user_id
  ),
  s as (
    select
      l.id, l.username, l.grade_level,
      (select count(*) from a where a.user_id = l.id and a.d = v_today)::int as today_q,
      (select count(*) filter (where a.is_correct) from a where a.user_id = l.id and a.d = v_today)::int as today_correct,
      lp.d as last_active,
      case when lp.d is null then null else v_today - lp.d end as days_since,
      (select coalesce(jsonb_agg(coalesce(x.q, 0) order by o.o), '[]'::jsonb)
         from generate_series(0, 6) o(o)
         left join (select a.d, count(*)::int q from a where a.user_id = l.id group by a.d) x
           on x.d = v_today - 6 + o.o) as q7,
      (select count(*) from a where a.user_id = l.id and a.d >= v_today - 6)::int as total7,
      (select count(*) filter (where a.is_correct) from a where a.user_id = l.id and a.d >= v_today - 6)::int as correct7,
      g.level as goal_level,
      g.computed_target as goal_target,
      case when g.student_id is null then null
           else coalesce((select sum(dp.day_points) from public.guardian_daily_points_bkk(l.id, v_week_start) dp), 0)::int
      end as goal_points
    from linked l
    left join last_play lp on lp.user_id = l.id
    left join public.guardian_goal g on g.student_id = l.id and g.week_start = v_week_start
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', s.id,
      'username', s.username,
      'grade_level', s.grade_level,
      'today_q', s.today_q,
      'today_correct', s.today_correct,
      'last_active', s.last_active,
      'days_since', s.days_since,
      'q7', s.q7,
      'total7', s.total7,
      'acc7', case when s.total7 > 0 then round(s.correct7::numeric / s.total7 * 100) end,
      'goal_level', s.goal_level,
      'goal_target', s.goal_target,
      'goal_points', s.goal_points,
      'status', case
        when s.last_active is null or (s.days_since >= 3) then 'gone'
        when s.total7 >= 10 and s.correct7::numeric / s.total7 < 0.40 then 'low'
        else 'ok' end
    ) order by s.username), '[]'::jsonb)
  into v_students
  from s;

  -- ราย 14 วัน (เก่า -> ใหม่)
  with linked as (
    select p.id
    from public.guardian_links gl
    join public.profiles p on p.id = gl.student_id
    where gl.guardian_id = v_uid and gl.status = 'claimed'
      and (p_grade is null or p.grade_level = p_grade)
  ),
  a as (
    select qa.user_id, (qa.created_at at time zone 'Asia/Bangkok')::date as d, qa.is_correct
    from public.quiz_attempts qa
    join linked l on l.id = qa.user_id
    where qa.source is null and qa.created_at >= v_start
  ),
  days as (
    select (v_today - 13 + o)::date as d from generate_series(0, 13) o
  ),
  per_day as (
    select days.d,
           count(distinct a.user_id)::int as active,
           count(a.user_id)::int as q,
           count(a.user_id) filter (where a.is_correct)::int as c
    from days left join a on a.d = days.d
    group by days.d
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('d', pd.d, 'active', pd.active, 'q', pd.q, 'correct', pd.c) order by pd.d) from per_day pd), '[]'::jsonb),
    jsonb_build_object(
      'this', (select jsonb_build_object('active_avg', round(sum(pd.active)::numeric / 7, 1), 'q', sum(pd.q)::int, 'correct', sum(pd.c)::int)
               from per_day pd where pd.d >= v_today - 6),
      'prev', (select jsonb_build_object('active_avg', round(sum(pd.active)::numeric / 7, 1), 'q', sum(pd.q)::int, 'correct', sum(pd.c)::int)
               from per_day pd where pd.d < v_today - 6)
    )
  into v_daily, v_compare;

  -- บทที่ทำได้ดี/ควรช่วย — 14 วันล่าสุด, ต้องมี >= 20 ข้อ และ >= 2 คน (กันบทที่ข้อมูลน้อย)
  with linked as (
    select p.id
    from public.guardian_links gl
    join public.profiles p on p.id = gl.student_id
    where gl.guardian_id = v_uid and gl.status = 'claimed'
      and (p_grade is null or p.grade_level = p_grade)
  ),
  ch as (
    select q.subject, q.branch, q.chapter,
           count(*)::int as n,
           count(distinct qa.user_id)::int as students,
           round(count(*) filter (where qa.is_correct)::numeric / count(*) * 100) as acc
    from public.quiz_attempts qa
    join linked l on l.id = qa.user_id
    join public.questions q on q.id = qa.question_id
    where qa.source is null and qa.created_at >= v_start
    group by q.subject, q.branch, q.chapter
    having count(*) >= 20 and count(distinct qa.user_id) >= 2
  )
  select
    coalesce((select jsonb_agg(to_jsonb(x)) from (
      select subject, branch, chapter, n, students, acc from ch where acc >= 60 order by acc desc, n desc limit 3) x), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(x)) from (
      select subject, branch, chapter, n, students, acc from ch where acc < 60 order by acc asc, n desc limit 3) x), '[]'::jsonb)
  into v_good, v_bad;

  return jsonb_build_object(
    'today', v_today,
    'grades', v_grades,
    'students', v_students,
    'daily', v_daily,
    'compare', v_compare,
    'chapters_good', v_good,
    'chapters_bad', v_bad
  );
end;
$$;

revoke all on function public.guardian_get_class_overview(text) from public, anon;
grant execute on function public.guardian_get_class_overview(text) to authenticated, service_role;
