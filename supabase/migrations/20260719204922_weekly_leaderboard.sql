-- Migration: 021_weekly_leaderboard (experimental)
-- version: 20260719204922 (ตรงกับ supabase_migrations.schema_migrations ใน production)
--
-- คนละเรื่องกับระบบอาหารเลย แต่หายไปจาก repo/migrations เหมือนกัน — เจอระหว่างเช็ค
-- list_migrations ทั้งหมดของโปรเจกต์ตอนตามหา food system migration เลยรวบมาด้วย

-- derive สดจาก quiz_attempts + daily_missions, ไม่มี table ใหม่, ไม่มี cron
-- "reset ทุกจันทร์" = filter ช่วง จ-อา Bangkok
-- สูตร/วัน: 20 ข้อแรก ถูก+2/ผิด+1 (max40) + mission +10 → daily cap 50 → week max 350
-- tie-breaker: accuracy ใน 20 ข้อที่นับ
-- exclude: Dawu, PonDKunG (test users)

create or replace function public.current_week_bounds_bkk()
returns table (week_start timestamptz, week_end timestamptz, week_start_date date)
language sql stable as $$
  with base as (select (now() at time zone 'Asia/Bangkok')::date as today_bkk),
  bounds as (
    select date_trunc('week', today_bkk)::date as monday,
           (date_trunc('week', today_bkk)::date + 7) as next_monday
    from base
  )
  select (monday::timestamp at time zone 'Asia/Bangkok'),
         (next_monday::timestamp at time zone 'Asia/Bangkok'),
         monday
  from bounds;
$$;

create or replace function public.weekly_scores_bkk()
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
  where a.total_points > 0;
$$;

create or replace function public.get_weekly_leaderboard()
returns table (rnk integer, username text, total_points integer, accuracy numeric)
language sql stable security definer set search_path = public as $$
  select (rank() over (order by total_points desc, accuracy desc))::integer,
    username, total_points, accuracy
  from public.weekly_scores_bkk()
  order by total_points desc, accuracy desc
  limit 5;
$$;

-- ⚠️ APP ต้องส่ง auth.uid() เท่านั้น ห้ามให้ client ส่ง id คนอื่น
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
    from public.weekly_scores_bkk()
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

grant execute on function public.current_week_bounds_bkk()  to authenticated;
grant execute on function public.weekly_scores_bkk()        to authenticated;
grant execute on function public.get_weekly_leaderboard()   to authenticated;
grant execute on function public.get_my_weekly_rank(uuid)   to authenticated;
