-- Phase 1/5 ของแผนแยก junior/senior — เพิ่ม p_grade_band (default null = ไม่กรอง, backward-compat)
-- ให้ weekly_scores_bkk() และ get_weekly_leaderboard() แทนที่ตัวเดิม (0-arg) ทั้งคู่ เพื่อเลี่ยง
-- PostgREST ambiguous-overload error (0-arg + optional-1-arg ชนกันไม่ได้ใน PostgREST schema cache)
-- จึง DROP ตัวเก่าทิ้งหลังสร้างตัวใหม่แทนที่จะปล่อยให้อยู่คู่กัน
--
-- get_my_weekly_rank(p_user_id) ของเดิมยังคงอยู่ (ไม่ลบ) เพราะพารามิเตอร์ p_grade_band ตัวใหม่ไม่มี
-- default (ต้องรู้ band เสมอ) จึงเพิ่ม overload ใหม่ get_my_weekly_rank(p_user_id, p_grade_band) แยก
-- ไปแทน — arg count ต่างกันจริง (1 vs 2) ไม่ชนกับ PostgREST เหมือนกรณี default-null ด้านบน ทำให้แอปเดิม
-- ที่ยังเรียกแบบ 1 พารามิเตอร์ (ก่อน phase 2 แก้ฝั่ง TS) ทำงานต่อได้ไม่กระทบ
--
-- ⚠️ ห้ามใช้ชื่อพารามิเตอร์/alias ว่า "band" เฉยๆ ในงานนี้ — คอลัมน์ผลลัพธ์ "band" เดิมของ
-- get_my_weekly_rank หมายถึง percentile tier (top/mid/start) คนละเรื่องกับ grade_band ทุกจุดที่เพิ่ม
-- ใหม่ในไฟล์นี้ใช้ชื่อ p_grade_band เท่านั้น

-- 1) weekly_scores_bkk: เพิ่ม p_grade_band, join profiles.grade_band, filter เมื่อไม่ null
--    (hardcode exclude test UUID เดิมคงตำแหน่งเดิมทุกประการ ไม่แตะ — คนละ scope)
create or replace function public.weekly_scores_bkk(p_grade_band text default null)
returns table (
  user_id uuid, username text, total_points integer,
  counted_correct integer, counted_q integer, accuracy numeric, days_active integer
)
language sql stable security definer set search_path = public as $$
  with wb as (select * from public.current_week_bounds_bkk()),
  ranked as (
    select qa.user_id,
      (qa.created_at at time zone 'Asia/Bangkok')::date as d, qa.is_correct,
      row_number() over (
        partition by qa.user_id, (qa.created_at at time zone 'Asia/Bangkok')::date
        order by qa.created_at) as rn
    from public.quiz_attempts qa, wb
    where qa.created_at >= wb.week_start and qa.created_at < wb.week_end
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
$$;

-- 2) get_my_weekly_rank(p_user_id) เดิม: คงลายเซ็นเดิมไว้ทุกประการ (แอปที่ยังไม่ผ่าน phase 2 เรียก
--    แบบนี้อยู่) แค่ชี้ไปเรียก weekly_scores_bkk(null) แทน weekly_scores_bkk() 0-arg ที่จะถูกลบด้านล่าง
--    พฤติกรรมเดิมทุกประการ (null = ไม่กรอง band)
create or replace function public.get_my_weekly_rank(p_user_id uuid)
returns table (
  in_top5 boolean, my_rank integer, total_players integer,
  band text, points integer, points_to_next integer
)
language sql stable security definer set search_path = public as $$
  with scored as (
    select user_id, total_points, accuracy,
      (rank() over (order by total_points desc, accuracy desc))::integer as rnk,
      (percent_rank() over (order by total_points desc, accuracy desc)) as pct,
      count(*) over () as total_players
    from public.weekly_scores_bkk(null)
  ),
  me as (select * from scored where user_id = p_user_id),
  next_up as (
    select s.total_points as next_points
    from scored s, me
    where s.rnk < me.rnk
    order by s.rnk desc limit 1
  )
  select (me.rnk <= 5), me.rnk, me.total_players::integer,
    case when me.pct <= 0.33 then 'top'
         when me.pct <= 0.66 then 'mid'
         else 'start' end,
    me.total_points,
    case when me.rnk = 1 then null
         else greatest((select next_points from next_up) - me.total_points + 1, 0)
    end
  from me;
$$;

-- 3) get_my_weekly_rank(p_user_id, p_grade_band) ใหม่: overload แยก (arg count ต่างจากตัวเดิม
--    ไม่ชนกับ PostgREST) filter pool ผ่าน weekly_scores_bkk(p_grade_band) *ก่อน* คำนวณ rank()/
--    percent_rank() ทำให้คอลัมน์ band (percentile tier เดิม) คำนวณบน pool ที่กรองแล้วเท่านั้น
create or replace function public.get_my_weekly_rank(p_user_id uuid, p_grade_band text)
returns table (
  in_top5 boolean, my_rank integer, total_players integer,
  band text, points integer, points_to_next integer
)
language sql stable security definer set search_path = public as $$
  with scored as (
    select user_id, total_points, accuracy,
      (rank() over (order by total_points desc, accuracy desc))::integer as rnk,
      (percent_rank() over (order by total_points desc, accuracy desc)) as pct,
      count(*) over () as total_players
    from public.weekly_scores_bkk(p_grade_band)
  ),
  me as (select * from scored where user_id = p_user_id),
  next_up as (
    select s.total_points as next_points
    from scored s, me
    where s.rnk < me.rnk
    order by s.rnk desc limit 1
  )
  select (me.rnk <= 5), me.rnk, me.total_players::integer,
    case when me.pct <= 0.33 then 'top'
         when me.pct <= 0.66 then 'mid'
         else 'start' end,
    me.total_points,
    case when me.rnk = 1 then null
         else greatest((select next_points from next_up) - me.total_points + 1, 0)
    end
  from me;
$$;

-- 4) get_weekly_leaderboard: เพิ่ม p_grade_band default null ส่งต่อเข้า weekly_scores_bkk
create or replace function public.get_weekly_leaderboard(p_grade_band text default null)
returns table (rnk integer, username text, total_points integer, accuracy numeric)
language sql stable security definer set search_path = public as $$
  select (rank() over (order by total_points desc, accuracy desc))::integer,
    username, total_points, accuracy
  from public.weekly_scores_bkk(p_grade_band)
  order by total_points desc, accuracy desc
  limit 5;
$$;

-- 5) ลบ overload 0-arg เดิมของ weekly_scores_bkk / get_weekly_leaderboard ทิ้ง — จำเป็นต้องลบ เพราะ
--    ถ้าปล่อยคู่กับตัว default-null ใหม่ ตอนเรียกแบบ 0-arg Postgres จะเลือก exact-match ตัวเก่าก่อน
--    เสมอ (ไม่มีวันไปถึง default เลย) แถม PostgREST เจอ overload คู่แบบนี้มักโยน PGRST203 ambiguous
--    function ด้วย (ต่างจาก get_my_weekly_rank ข้อ 2-3 ที่ arg count ต่างกันจริง 1 vs 2 เลยไม่ชน
--    ไม่ต้องลบตัวเก่า)
drop function if exists public.get_weekly_leaderboard();
drop function if exists public.weekly_scores_bkk();

-- 6) grant execute ให้ signature ใหม่ — grant เดิมผูกกับ signature เดิมที่โดนลบไปแล้ว (ของ
--    get_my_weekly_rank(uuid) ไม่ต้อง grant ซ้ำ เพราะ create or replace ลายเซ็นเดิมไม่กระทบ grant เดิม)
grant execute on function public.weekly_scores_bkk(text)       to authenticated;
grant execute on function public.get_weekly_leaderboard(text)  to authenticated;
grant execute on function public.get_my_weekly_rank(uuid, text) to authenticated;
