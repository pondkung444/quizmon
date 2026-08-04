-- Migration: 20260804120100_weekly_scores_filter_dungeon_bonus
-- Phase 3 (ระบบผจญภัย): กรองคำถามโบนัสดันเจี้ยน (quiz_attempts.source = 'dungeon_bonus') ออกจาก
-- CTE ranked ของทั้ง weekly_scores_bkk() และ weekly_scores_bkk_for_week() ไม่งั้นคำถามโบนัสที่ไม่ได้
-- ให้ EXP จะดันไปนับแต้มลีดเดอร์บอร์ดด้วย (ดู migration ก่อนหน้า 20260804120000)
--
-- create or replace เขียนทับของเดิม เก็บ signature เดิมทุกอย่าง เปลี่ยนแค่เนื้อ query (เพิ่ม 1 บรรทัด
-- ใน WHERE ของ CTE ranked ทั้ง 2 ฟังก์ชัน) — ไม่ลบแล้วสร้างใหม่ กันพังของ dependency ที่อ้างอิงอยู่
-- (claim_weekly_leaderboard_reward() เรียก weekly_scores_bkk_for_week() ตรงๆ)

create or replace function public.weekly_scores_bkk(p_grade_band text default null::text)
 returns table(user_id uuid, username text, total_points integer, counted_correct integer, counted_q integer, accuracy numeric, days_active integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with wb as (select * from public.current_week_bounds_bkk()),
  ranked as (
    select qa.user_id,
      (qa.created_at at time zone 'Asia/Bangkok')::date as d, qa.is_correct,
      row_number() over (
        partition by qa.user_id, (qa.created_at at time zone 'Asia/Bangkok')::date
        order by qa.created_at) as rn
    from public.quiz_attempts qa, wb
    where qa.created_at >= wb.week_start and qa.created_at < wb.week_end
      and qa.source is null
      and qa.user_id not in (
        '792b8e1d-410c-4158-9c62-32b437b05121',  -- PonDKunG (test)
        'b497d6dd-7300-4966-bfe4-c272aa9a1e63'   -- Dawu (test)
      )
  ),
  daily_q as (
    select user_id, d,
      sum(case when rn<=20 and is_correct then 2 when rn<=20 then 1 else 0 end) as q_points,
      sum(case when rn<=20 and is_correct then 1 else 0 end) as cc,
      sum(case when rn<=20 then 1 else 0 end) as cq
    from ranked group by 1,2
  ),
  daily_m as (
    select dm.user_id, dm.mission_date as d, 10 as m_points
    from public.daily_missions dm, wb
    where dm.bonus_awarded_at is not null
      and dm.mission_date >= wb.week_start_date
      and dm.mission_date < (wb.week_start_date + 7)
      and dm.user_id not in (
        '792b8e1d-410c-4158-9c62-32b437b05121',
        'b497d6dd-7300-4966-bfe4-c272aa9a1e63'
      )
  ),
  daily_total as (
    select coalesce(q.user_id,m.user_id) as user_id, coalesce(q.d,m.d) as d,
      least(coalesce(q.q_points,0)+coalesce(m.m_points,0),50) as day_points,
      coalesce(q.cc,0) as cc, coalesce(q.cq,0) as cq
    from daily_q q full outer join daily_m m using (user_id,d)
  ),
  agg as (
    select user_id, sum(day_points)::integer as total_points,
      sum(cc)::integer as counted_correct, sum(cq)::integer as counted_q,
      count(distinct d)::integer as days_active
    from daily_total group by user_id
  )
  select a.user_id, p.username, a.total_points, a.counted_correct, a.counted_q,
    round(a.counted_correct::numeric/nullif(a.counted_q,0)*100,0) as accuracy,
    a.days_active
  from agg a join public.profiles p on p.id = a.user_id
  where a.total_points > 0
    and (p_grade_band is null or p.grade_band = p_grade_band);
$function$;

create or replace function public.weekly_scores_bkk_for_week(p_week_start_date date, p_grade_band text default null::text)
 returns table(user_id uuid, username text, total_points integer, counted_correct integer, counted_q integer, accuracy numeric, days_active integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    where qa.created_at >= wb.week_start and qa.created_at < wb.week_end
      and qa.source is null
      and qa.user_id not in (
        '792b8e1d-410c-4158-9c62-32b437b05121',  -- PonDKunG (test)
        'b497d6dd-7300-4966-bfe4-c272aa9a1e63'   -- Dawu (test)
      )
  ),
  daily_q as (
    select user_id, d,
      sum(case when rn<=20 and is_correct then 2 when rn<=20 then 1 else 0 end) as q_points,
      sum(case when rn<=20 and is_correct then 1 else 0 end) as cc,
      sum(case when rn<=20 then 1 else 0 end) as cq
    from ranked group by 1,2
  ),
  daily_m as (
    select dm.user_id, dm.mission_date as d, 10 as m_points
    from public.daily_missions dm, wb
    where dm.bonus_awarded_at is not null
      and dm.mission_date >= p_week_start_date
      and dm.mission_date < (p_week_start_date + 7)
      and dm.user_id not in (
        '792b8e1d-410c-4158-9c62-32b437b05121',
        'b497d6dd-7300-4966-bfe4-c272aa9a1e63'
      )
  ),
  daily_total as (
    select coalesce(q.user_id,m.user_id) as user_id, coalesce(q.d,m.d) as d,
      least(coalesce(q.q_points,0)+coalesce(m.m_points,0),50) as day_points,
      coalesce(q.cc,0) as cc, coalesce(q.cq,0) as cq
    from daily_q q full outer join daily_m m using (user_id,d)
  ),
  agg as (
    select user_id, sum(day_points)::integer as total_points,
      sum(cc)::integer as counted_correct, sum(cq)::integer as counted_q,
      count(distinct d)::integer as days_active
    from daily_total group by user_id
  )
  select a.user_id, p.username, a.total_points, a.counted_correct, a.counted_q,
    round(a.counted_correct::numeric/nullif(a.counted_q,0)*100,0) as accuracy,
    a.days_active
  from agg a join public.profiles p on p.id = a.user_id
  where a.total_points > 0
    and (p_grade_band is null or p.grade_band = p_grade_band);
$function$;

-- ============================================================
-- Rollback: re-run migration 20260727082823_weekly_leaderboard_grade_band.sql (เนื้อ query เดิม
-- ก่อน source is null) ด้วย create or replace
-- ============================================================
