-- Migration: 20260914130000_guardian_insight_phase1
-- Guardian — Phase 1: insight page backend (activity log + guardian_get_* RPCs)
-- อ้างอิง: task "Guardian insight page (/guardian/[studentId]) — needs new RPCs + activity log table"
--
-- ขอบเขต: guardian_activity_log (audit table, insert เฉพาะผ่าน RPC) +
-- guardian_daily_points_bkk (internal helper, ไม่ grant execute ให้ authenticated) +
-- guardian_get_weekly_calendar / guardian_get_goal_progress / guardian_get_categories /
-- guardian_get_qmon_display / guardian_log_insight_view (ทุกตัว gate ด้วย is_guardian_admin +
-- guardian_links.status='claimed' แบบเดียวกับ guardian_get_plan ที่มีอยู่แล้ว)
--
-- ไม่แตะ weekly_scores_bkk_for_week()/weekly_scores_bkk()/get_hall_of_fame_page() เดิมเลย
-- (ยืนยัน prosrc ตรงกับ repo แล้วผ่าน Supabase MCP ก่อนร่างไฟล์นี้) — guardian_daily_points_bkk()
-- เป็นฟังก์ชันใหม่แยกต่างหากที่ copy สูตร day_points CTE เดียวกันมา (ไม่ได้ไปแก้ของเดิม เพราะ
-- weekly_scores_bkk_for_week ผูกกับระบบแจกรางวัลจริงที่ claim_weekly_leaderboard_reward() เรียกอยู่
-- — เสี่ยงเกินไปที่จะ refactor ให้ใช้ร่วมกันในรอบนี้)
--
-- ทุก object ใช้ IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS ให้ idempotent

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) guardian_activity_log — audit log (มิเรอร์ pattern ของ analytics_events: insert-only,
--    ไม่มี select policy ให้ใครเลยแม้แต่เจ้าของ guardian_id — อ่านได้เฉพาะผ่าน service role/SQL
--    console ตอนนี้ ยังไม่มีหน้า admin ให้ดู log นี้)
-- ============================================================
create table if not exists public.guardian_activity_log (
  id bigint generated always as identity primary key,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  target_student_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('view_insight', 'set_goal', 'view_plan')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists guardian_activity_log_student_ts_idx
  on public.guardian_activity_log (target_student_id, created_at);

create index if not exists guardian_activity_log_guardian_ts_idx
  on public.guardian_activity_log (guardian_id, created_at);

alter table public.guardian_activity_log enable row level security;

-- ไม่มี policy เลยแม้แต่ select — ตั้งใจ (audit log ล้วน) เขียนได้เฉพาะผ่าน
-- guardian_log_insight_view() (security definer) ด้านล่างเท่านั้น

comment on table public.guardian_activity_log is
  'Audit log ของทุกครั้งที่ผู้ปกครองดู insight/ตั้งเป้า/ดูแผนของนักเรียนที่ลิงก์แล้ว — '
  'insert เฉพาะผ่าน RPC (security definer) ไม่มี select policy ให้ client เลย.';

-- ============================================================
-- 2) guardian_daily_points_bkk — internal helper: mirror สูตร day_points เดียวกับ
--    weekly_scores_bkk_for_week() (2 คะแนน/ถูก, 1/ผิด นับแค่ 20 ข้อแรกของวัน, +10 ถ้า claim
--    daily mission bonus, cap 50/วัน) แต่คืนทีละวันแทนที่จะ sum ทั้งสัปดาห์ — ไม่ได้แก้ไข
--    weekly_scores_bkk_for_week() เดิมเลย เป็นฟังก์ชันคู่ขนานที่ copy สูตรมาเฉยๆ
--
--    ไม่ gate allowlist/link เอง (รับ p_user_id ตรงๆ ไม่เช็ค auth.uid()) — เป็น internal helper
--    เท่านั้น ต้อง revoke execute จาก public/authenticated ข้างล่าง กันหลุดให้ client เรียกตรง
--    ข้าม guardian_get_weekly_calendar() ได้ (ไม่งั้นใครก็ขอดูคะแนนรายวันของใครก็ได้)
-- ============================================================
create or replace function public.guardian_daily_points_bkk(p_user_id uuid, p_week_start_date date)
returns table (d date, day_points integer, counted_correct integer, counted_q integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with wb as (
    select (p_week_start_date::timestamp at time zone 'Asia/Bangkok') as week_start,
           ((p_week_start_date + 7)::timestamp at time zone 'Asia/Bangkok') as week_end
  ),
  ranked as (
    select qa.user_id,
      (qa.created_at at time zone 'Asia/Bangkok')::date as d, qa.is_correct,
      row_number() over (
        partition by qa.user_id, (qa.created_at at time zone 'Asia/Bangkok')::date
        order by qa.created_at) as rn
    from public.quiz_attempts qa, wb
    where qa.user_id = p_user_id
      and qa.created_at >= wb.week_start and qa.created_at < wb.week_end
      and qa.source is null
  ),
  daily_q as (
    select d,
      sum(case when rn<=20 and is_correct then 2 when rn<=20 then 1 else 0 end) as q_points,
      sum(case when rn<=20 and is_correct then 1 else 0 end) as cc,
      sum(case when rn<=20 then 1 else 0 end) as cq
    from ranked group by 1
  ),
  daily_m as (
    select dm.mission_date as d, 10 as m_points
    from public.daily_missions dm
    where dm.user_id = p_user_id
      and dm.bonus_awarded_at is not null
      and dm.mission_date >= p_week_start_date
      and dm.mission_date < (p_week_start_date + 7)
  )
  select coalesce(q.d, m.d) as d,
    least(coalesce(q.q_points,0) + coalesce(m.m_points,0), 50)::integer as day_points,
    coalesce(q.cc,0)::integer as counted_correct,
    coalesce(q.cq,0)::integer as counted_q
  from daily_q q full outer join daily_m m using (d);
$$;

revoke all on function public.guardian_daily_points_bkk(uuid, date) from public;
revoke all on function public.guardian_daily_points_bkk(uuid, date) from authenticated;
revoke all on function public.guardian_daily_points_bkk(uuid, date) from anon;

comment on function public.guardian_daily_points_bkk(uuid, date) is
  'Internal helper เท่านั้น — ไม่ gate auth.uid()/allowlist เอง ห้าม grant execute ให้ authenticated/anon '
  'เด็ดขาด (รับ user_id ตรงๆ) เรียกได้เฉพาะจาก guardian_get_weekly_calendar() ซึ่งเป็น security definer '
  'อีกชั้นที่ทำ gate ก่อนแล้ว.';

-- ============================================================
-- 3) guardian_get_weekly_calendar — 7 วันของสัปดาห์ที่ระบุ (default = สัปดาห์ปัจจุบัน)
--    คืนแค่ day_points/has_data/is_today/is_future ไม่คืน counted_correct/counted_q ให้ UI
--    ชั้นนี้ (เผื่ออนาคตอยากโชว์ accuracy เพิ่มค่อยขยาย ตอนนี้ทำเท่าที่ mockup ต้องการ)
-- ============================================================
create or replace function public.guardian_get_weekly_calendar(
  p_student_id uuid,
  p_week_start_date date default null
)
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

  -- generate_series(date, date, interval) คืน timestamp ไม่ใช่ date เอง — cast ::date ทุกจุดที่ใช้
  -- (เทียบ/join/return) กันพลาด type ตอน return query (RETURNS TABLE ประกาศ d เป็น date)
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

grant execute on function public.guardian_get_weekly_calendar(uuid, date) to authenticated;

-- ============================================================
-- 4) guardian_get_goal_progress — ต่อ goal ของแผน active ของนักเรียนคนนี้ (เฉพาะที่ลิงก์กับ
--    ผู้ปกครองคนนี้) คืน "bucket" ข้อความล้วน ไม่คืนตัวเลขดิบ/เปอร์เซ็นต์ให้ client เห็นเลย
--    (design doc 5.7 — ห้าม parent เห็นตัวเลขดิบ) นับ "answered" (ไม่ใช่ correct) แบบเดียวกับ
--    missions.ts (target_count เทียบกับ answeredCount ไม่ใช่ correctCount)
-- ============================================================
create or replace function public.guardian_get_goal_progress(p_student_id uuid)
returns table (
  goal_id uuid,
  subject text,
  category text,
  bucket text
)
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

grant execute on function public.guardian_get_goal_progress(uuid) to authenticated;

comment on function public.guardian_get_goal_progress(uuid) is
  'คืน bucket ข้อความล้วนเท่านั้น (ยังไม่เริ่ม/เริ่มแล้ว/ไปได้ดี/เกือบถึงแล้ว/ถึงเป้าแล้ว) '
  'ห้ามเพิ่มคอลัมน์ตัวเลขดิบ/เปอร์เซ็นต์เด็ดขาด (design doc 5.7).';

-- ============================================================
-- 5) guardian_get_categories — top weak/strong categories ของนักเรียนคนนี้ ย้อนหลัง 30 วัน
--    เฉพาะ category ที่ตอบ >=10 ข้อขึ้นไปในช่วงนั้น คืน tier ข้อความล้วน ไม่คืน accuracy ตัวเลข
--    (คล่องแล้ว >=80% / กำลังไปได้ 50-79% / ยังต้องฝึก <50%) — คืนทุก category ที่เข้าเกณฑ์ ไม่ตัด
--    เหลือ 3 ให้ (หน้า UI เป็นคนตัด top 3 + ใช้ full list เดียวกันตอนกด "ดูทั้งหมด")
-- ============================================================
create or replace function public.guardian_get_categories(p_student_id uuid)
returns table (
  subject text,
  category text,
  answered_count integer,
  tier text
)
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

grant execute on function public.guardian_get_categories(uuid) to authenticated;

comment on function public.guardian_get_categories(uuid) is
  'คืน tier ข้อความล้วนเท่านั้น (คล่องแล้ว/กำลังไปได้/ยังต้องฝึก) ห้ามเพิ่ม accuracy ตัวเลขดิบ '
  '— ย้อนหลัง 30 วัน กรองเฉพาะ category ที่ตอบ >=10 ข้อ.';

-- ============================================================
-- 6) guardian_get_qmon_display — Qmon ที่ active ของนักเรียนคนนี้ ทรงเดียวกับ PetDisplayInput
--    (src/components/social/petSummary.ts) ให้ client เรียก resolvePetDisplay() ต่อได้เลย
-- ============================================================
create or replace function public.guardian_get_qmon_display(p_student_id uuid)
returns table (
  nickname text,
  stage integer,
  subline text,
  personality text,
  egg_sprite_prefix text,
  egg_name_th text
)
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
  select p.nickname, p.stage, p.subline, p.personality, e.sprite_prefix, e.name_th
  from public.pets p
  join public.egg_types e on e.id = p.egg_type_id
  where p.user_id = p_student_id and p.is_active = true
  limit 1;
end;
$$;

grant execute on function public.guardian_get_qmon_display(uuid) to authenticated;

-- ============================================================
-- 7) guardian_log_insight_view — insert audit log แถวเดียว ต่อ 1 ครั้งที่หน้า insight โหลด
--    (เรียกจาก server component ตอน render ไม่ใช่จาก client action)
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

grant execute on function public.guardian_log_insight_view(uuid) to authenticated;

commit;
