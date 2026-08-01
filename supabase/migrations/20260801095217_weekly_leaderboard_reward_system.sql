-- ฟังก์ชันคะแนนรายสัปดาห์แบบ "ระบุสัปดาห์เอง" — แยกจาก weekly_scores_bkk()/get_weekly_leaderboard()
-- โดยตั้งใจ ไม่แก้ของเดิมที่ live อยู่แล้ว เพื่อกัน PostgREST ambiguous-overload error ที่เคยเจอมาก่อน
-- (ดู 20260727082823_weekly_leaderboard_grade_band.sql) — ใช้ซ้ำได้ทั้งระบบแจกรางวัลรายสัปดาห์
-- และหน้า Hall of Fame ในอนาคต ไม่ต้องสร้างฟังก์ชันคำนวณคะแนนย้อนหลังอันที่สอง
create or replace function public.weekly_scores_bkk_for_week(p_week_start_date date, p_grade_band text default null)
returns table (
  user_id uuid, username text, total_points integer,
  counted_correct integer, counted_q integer, accuracy numeric, days_active integer
)
language sql stable security definer set search_path = public as $$
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
$$;

grant execute on function public.weekly_scores_bkk_for_week(date, text) to authenticated;

-- ตาราง log การแจกรางวัลรายสัปดาห์ — unique (user_id, week_start_date) กันแจกซ้ำต่อคนต่อสัปดาห์
-- (ไม่แยก unique ตาม grade_band เพราะผู้เล่น 1 คนอยู่ band เดียวเสมอ ชนะได้บอร์ดเดียวต่อสัปดาห์)
create table public.weekly_leaderboard_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  week_start_date date not null,
  grade_band text not null check (grade_band in ('junior','senior')),
  egg_type_id text not null references public.egg_types(id),
  player_egg_id uuid references public.player_eggs(id),
  awarded_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

comment on table public.weekly_leaderboard_rewards is
  'Log การแจกไข่รางวัลจากการติดอันดับ 1 weekly leaderboard — เขียนผ่าน RPC claim_weekly_leaderboard_reward() เท่านั้น (security definer), client ห้าม insert/update ตรง';

alter table public.weekly_leaderboard_rewards enable row level security;

create policy "users can view own weekly rewards"
  on public.weekly_leaderboard_rewards
  for select
  using (auth.uid() = user_id);

-- RPC เคลมรางวัล — pattern เดียวกับ claim_daily_mission_bonus: ตรวจสิทธิ์ + insert แบบ atomic ใน
-- ฟังก์ชันเดียว กัน race condition ผ่าน unique constraint ด้านบน (insert ซ้ำจะชน constraint ไม่ใช่
-- ต้อง SELECT-then-INSERT แยกสองจังหวะ)
-- อ้างอิงสัปดาห์ที่ "เพิ่งจบ" เท่านั้น (current_week_bounds_bkk().week_start_date - 7) ไม่ใช่สัปดาห์
-- ปัจจุบันที่ยังไม่จบ — กันแจกก่อนอันดับนิ่ง
-- ไม่ hardcode cap จำนวนไข่รางวัลทั้งระบบ (ยังไม่เคาะ ตามเอกสาร) — เพิ่ม cap ทีหลังแค่เติมเงื่อนไข
-- where/exists เพิ่มในฟังก์ชันนี้ได้เลย ไม่ต้องแก้ schema
create or replace function public.claim_weekly_leaderboard_reward()
returns table (awarded boolean, egg_type_id text)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_last_week_start date;
  v_grade_band text;
  v_won boolean;
  v_egg_type_id text := 'egg_legendary_01';
  v_new_egg_id uuid;
begin
  if v_user_id is null then
    raise exception 'ต้องล็อกอินก่อน';
  end if;

  select p.grade_band into v_grade_band from public.profiles p where p.id = v_user_id;
  if v_grade_band is null then
    return query select false, null::text;
    return;
  end if;

  select wb.week_start_date - 7 into v_last_week_start
  from public.current_week_bounds_bkk() wb;

  if exists (
    select 1 from public.weekly_leaderboard_rewards r
    where r.user_id = v_user_id and r.week_start_date = v_last_week_start
  ) then
    return query select false, null::text;
    return;
  end if;

  select exists (
    select 1 from (
      select s.user_id, (rank() over (order by s.total_points desc, s.accuracy desc))::integer as rnk
      from public.weekly_scores_bkk_for_week(v_last_week_start, v_grade_band) s
    ) ranked
    where ranked.user_id = v_user_id and ranked.rnk = 1
  ) into v_won;

  if not v_won then
    return query select false, null::text;
    return;
  end if;

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (v_user_id, v_egg_type_id, 'weekly_leaderboard_reward')
  returning id into v_new_egg_id;

  insert into public.weekly_leaderboard_rewards (user_id, week_start_date, grade_band, egg_type_id, player_egg_id)
  values (v_user_id, v_last_week_start, v_grade_band, v_egg_type_id, v_new_egg_id);

  return query select true, v_egg_type_id;
end;
$$;

grant execute on function public.claim_weekly_leaderboard_reward() to authenticated;
