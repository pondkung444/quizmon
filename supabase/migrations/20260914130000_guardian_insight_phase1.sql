-- Migration: 20260914130000_guardian_insight_phase1
-- Guardian (ผู้พิทักษ์) — Phase 1: insight dashboard RPCs + audit log
--
-- *** BACKFILL NOTICE (เขียนย้อนหลัง 2026-09-15) ***
-- ไฟล์นี้ถูกเขียนย้อนหลังหลังพบว่า migration ตัวนี้ถูก apply ตรงผ่าน Supabase MCP เมื่อ 2026-09-14
-- (ปรากฏใน supabase_migrations.schema_migrations เป็น version 20260914231434 ชื่อ
-- "20260914130000_guardian_insight_phase1") แต่ไม่เคย commit ไฟล์เข้า repo — เป็น schema drift
-- ที่ปอนด์สั่งให้ backfill เอกสารเท่านั้น (ห้ามรัน apply_migration ซ้ำ เพราะ object พวกนี้มีอยู่จริง
-- ใน production แล้ว)
--
-- เนื้อหาด้านล่างดึงจาก live DB ตรงๆ ผ่าน pg_get_functiondef()/information_schema/pg_policy
-- (ไม่ได้ reconstruct จากความจำหรือ design doc) ให้ตรงกับสภาพจริงที่ apply แล้ว ณ วันที่ backfill —
-- ยกเว้น guardian_get_qmon_display ซึ่งถูกแก้ต่อด้วย migration ถัดไป
-- (20260914130100_fix_guardian_qmon_stage_type, version จริง 20260915005554) จึงไม่รวมไว้ในไฟล์นี้
-- เพื่อไม่ให้ definition ซ้ำซ้อนกันสองที่ — ดูฟังก์ชันนั้นในไฟล์ fix แทน
--
-- ไม่รับประกันว่าตรงกับ SQL ต้นฉบับที่รันจริงวันที่ 14 แบบ byte-for-byte (ไม่มีการเก็บ SQL ต้นฉบับไว้
-- ที่ไหนเลยตอน apply ตรงผ่าน MCP) แต่รับประกันว่ารวมกับไฟล์ fix ถัดไปแล้ว reproduce สภาพ live
-- ปัจจุบันได้ตรงเป๊ะ (ยืนยันด้วย pg_get_functiondef ตอน backfill)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) guardian_activity_log — audit log ทุกครั้งที่ผู้ปกครองดู insight/ตั้งเป้า/ดูแผน
--    append-only ผ่าน RPC (security definer) เท่านั้น — RLS enabled แต่ไม่มี policy ให้ client
--    เลยแม้แต่ select (deny-all โดยเจตนา — อ่านได้เฉพาะผ่าน service role/RPC ในอนาคตถ้าจำเป็น)
-- ============================================================
create table if not exists public.guardian_activity_log (
  id bigint generated always as identity primary key,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  target_student_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('view_insight', 'set_goal', 'view_plan')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists guardian_activity_log_student_ts_idx
  on public.guardian_activity_log (target_student_id, created_at);

create index if not exists guardian_activity_log_guardian_ts_idx
  on public.guardian_activity_log (guardian_id, created_at);

alter table public.guardian_activity_log enable row level security;

-- ตั้งใจไม่มี policy ใดๆ (select/insert/update/delete) ให้ client เลย — deny-all แม้แต่เจ้าของแถว
-- อ่าน/เขียนได้เฉพาะผ่าน RPC security definer (guardian_log_insight_view) เท่านั้น

comment on table public.guardian_activity_log is
  'Audit log ของทุกครั้งที่ผู้ปกครองดู insight/ตั้งเป้า/ดูแผนของนักเรียนที่ลิงก์แล้ว — insert เฉพาะผ่าน RPC (security definer) ไม่มี select policy ให้ client เลย.';

-- ============================================================
-- 2) guardian_get_categories — สรุปหมวดที่นักเรียนตอบ 30 วันล่าสุด แยก tier ตาม accuracy
-- ============================================================
create or replace function public.guardian_get_categories(p_student_id uuid)
returns table (subject text, category text, answered_count integer, tier text)
language plpgsql
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
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  return query
  select
    q.subject,
    q.category,
    count(*)::integer as answered_count,
    case
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.80 then 'คล่องแล้ว'
      when count(*) filter (where qa.is_correct)::numeric / count(*) >= 0.50 then 'กำลังไปได้'
      else 'ยังต้องฝึก'
    end as tier
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  where qa.user_id = p_student_id
    and qa.source is null
    and qa.created_at >= now() - interval '30 days'
  group by q.subject, q.category
  having count(*) >= 10
  order by q.subject, q.category;
end;
$$;

-- ============================================================
-- 3) guardian_get_goal_progress — bucket ความคืบหน้าของเป้าหมายย่อยในแผน active (schema เดิม:
--    ผูกกับ guardian_plan/guardian_goal แบบ subject+category+target_weekly_count)
-- ============================================================
create or replace function public.guardian_get_goal_progress(p_student_id uuid)
returns table (goal_id uuid, subject text, category text, bucket text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
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

  return query
  select
    gg.id,
    gg.subject,
    gg.category,
    case
      when gg.target_weekly_count = 0 then 'ยังไม่ได้ตั้งเป้าหมาย'
      else (
        with answered as (
          select count(*) as c
          from public.quiz_attempts qa
          join public.questions q on q.id = qa.question_id
          where qa.user_id = p_student_id
            and qa.source is null
            and qa.created_at >= (v_week_start::timestamp at time zone 'Asia/Bangkok')
            and qa.created_at < ((v_week_start + 7)::timestamp at time zone 'Asia/Bangkok')
            and q.subject = gg.subject
            and q.category = gg.category
        )
        select case
          when a.c = 0 then 'ยังไม่เริ่ม'
          when a.c::numeric / gg.target_weekly_count < 0.40 then 'เริ่มแล้ว'
          when a.c::numeric / gg.target_weekly_count < 0.70 then 'ไปได้ดี'
          when a.c::numeric / gg.target_weekly_count < 1.00 then 'เกือบถึงแล้ว'
          else 'ถึงเป้าแล้ว'
        end
        from answered a
      )
    end as bucket
  from public.guardian_plan gp
  join public.guardian_goal gg on gg.plan_id = gp.id
  where gp.student_id = p_student_id
    and gp.guardian_id = v_uid
    and gp.is_active;
end;
$$;

-- ============================================================
-- 4) guardian_get_weekly_calendar — ปฏิทินแต้มรายวันของสัปดาห์ที่ระบุ (default สัปดาห์ปัจจุบัน)
-- ============================================================
create or replace function public.guardian_get_weekly_calendar(p_student_id uuid, p_week_start_date date default null::date)
returns table (d date, day_points integer, has_data boolean, is_today boolean, is_future boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_today date;
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
$$;

-- ============================================================
-- 5) guardian_log_insight_view — เขียน audit log ทุกครั้งที่ผู้ปกครองดู insight ของนักเรียน
-- ============================================================
create or replace function public.guardian_log_insight_view(p_student_id uuid)
returns void
language plpgsql
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
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงข้อมูลของนักเรียนคนนี้';
  end if;

  insert into public.guardian_activity_log (guardian_id, target_student_id, event_type)
  values (v_uid, p_student_id, 'view_insight');
end;
$$;

commit;
