-- ============================================================
-- 1) test_accounts — ตารางกลางสำหรับ exclude บัญชีทดสอบ
--    แทนการ hardcode UUID list กระจายในหลายฟังก์ชัน
-- ============================================================
create table public.test_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text
);

alter table public.test_accounts enable row level security;
-- ไม่มี policy ตั้งใจ — เข้าถึงได้เฉพาะผ่าน SECURITY DEFINER function/service role เท่านั้น
-- client อ่าน/เขียนตรงไม่ได้เลย

insert into public.test_accounts (user_id, note) values
  ('792b8e1d-410c-4158-9c62-32b437b05121', 'PonDKunG - บัญชีส่วนตัวของปอนด์'),
  ('b497d6dd-7300-4966-bfe4-c272aa9a1e63', 'Dawu'),
  ('abbc806f-8da6-49b8-a655-3aeb9dcae6e8', 'ต้าอู๋ห์ / Daou');

-- ============================================================
-- 2) FIX: weekly_scores_bkk — ใช้ test_accounts แทน hardcode
--    (CREATE OR REPLACE พอ เพราะ signature เดิมไม่เปลี่ยน)
-- ============================================================
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
      and qa.user_id not in (select ta.user_id from public.test_accounts ta)
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
      and dm.user_id not in (select ta.user_id from public.test_accounts ta)
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
-- 3) Friend Code — เพิ่มคอลัมน์ใน profiles (ไม่แยกตารางใหม่)
-- ============================================================
alter table public.profiles add column friend_code text unique;

create or replace function public.generate_friend_code()
 returns text
 language plpgsql
as $function$
declare
  -- ตัด 0/O, 1/I/L, 2/Z ที่สับสนง่ายออก เหลือ 29 ตัว
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXY3456789';
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from public.profiles where friend_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$function$;

-- ผูกเข้ากับ handle_new_user() เดิม — เพิ่ม friend_code ตอนสมัครใหม่
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, username, phone, school, grade_level, friend_code)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'school', ''),
    nullif(new.raw_user_meta_data ->> 'grade_level', ''),
    public.generate_friend_code()
  );

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  insert into public.raid_allowlist (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

-- Backfill Friend Code ให้ผู้ใช้เดิมทั้งหมด (126 rows ใน profiles)
do $$
declare
  r record;
begin
  for r in select id from public.profiles where friend_code is null loop
    update public.profiles set friend_code = public.generate_friend_code() where id = r.id;
  end loop;
end $$;

-- ============================================================
-- 4) profile_settings — ของที่ผู้เล่นเลือกแสดงเอง
-- ============================================================
create table public.profile_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pride_pet_id uuid references public.pets(id) on delete set null,
  favorite_pet_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint favorite_pet_ids_max_3 check (array_length(favorite_pet_ids, 1) is null or array_length(favorite_pet_ids, 1) <= 3)
);

alter table public.profile_settings enable row level security;

create policy "profile_settings: select own" on public.profile_settings
  for select using (auth.uid() = user_id);
create policy "profile_settings: update own" on public.profile_settings
  for update using (auth.uid() = user_id);
create policy "profile_settings: insert own" on public.profile_settings
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- 5) friendships — ความสัมพันธ์ที่ยืนยันแล้ว (เก็บคู่แบบ low < high กัน duplicate)
-- ============================================================
create table public.friendships (
  user_id_low uuid not null references auth.users(id) on delete cascade,
  user_id_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id_low, user_id_high),
  constraint friendships_order check (user_id_low < user_id_high)
);

alter table public.friendships enable row level security;
-- ไม่มี policy ตั้งใจ — อ่าน/เขียนผ่าน SECURITY DEFINER RPC เท่านั้น (เฟส 3-4)

create index friendships_low_idx on public.friendships (user_id_low);
create index friendships_high_idx on public.friendships (user_id_high);

-- helper function ใช้ซ้ำได้ในเฟสถัดไป (ranking scope=เพื่อน, รายชื่อเพื่อน ฯลฯ)
create or replace function public.friend_ids(p_user_id uuid)
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when user_id_low = p_user_id then user_id_high else user_id_low end
  from public.friendships
  where user_id_low = p_user_id or user_id_high = p_user_id;
$function$;

-- ============================================================
-- 6) friend_requests
-- ============================================================
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_not_self check (requester_id <> addressee_id)
);

alter table public.friend_requests enable row level security;
-- ไม่มี policy ตั้งใจ — ผ่าน RPC เท่านั้น (เฟส 3)

create unique index friend_requests_pending_unique
  on public.friend_requests (requester_id, addressee_id)
  where status = 'pending';
create index friend_requests_addressee_idx on public.friend_requests (addressee_id, status);
create index friend_requests_requester_idx on public.friend_requests (requester_id, status);

-- ============================================================
-- 7) profile_likes
-- ============================================================
create table public.profile_likes (
  liker_id uuid not null references auth.users(id) on delete cascade,
  profile_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (liker_id, profile_user_id),
  constraint profile_likes_not_self check (liker_id <> profile_user_id)
);

alter table public.profile_likes enable row level security;
-- ไม่มี policy ตั้งใจ — ผ่าน RPC เท่านั้น (เฟส 5)

create index profile_likes_profile_idx on public.profile_likes (profile_user_id);

-- ============================================================
-- 8) encouragements (ส่งกำลังใจ)
-- ============================================================
create table public.encouragements (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  message_key text not null check (message_key in ('qmon_cool','good_job_today','keep_going','reach_the_goal')),
  sent_date date not null, -- Bangkok date คำนวณฝั่ง app ตามกฎเดิมของโปรเจกต์ ห้ามใช้ current_date ของ DB
  created_at timestamptz not null default now(),
  constraint encouragements_not_self check (sender_id <> recipient_id),
  unique (sender_id, recipient_id, sent_date)
);

alter table public.encouragements enable row level security;
-- ไม่มี policy ตั้งใจ — ผ่าน RPC เท่านั้น (เฟส 7)

create index encouragements_recipient_idx on public.encouragements (recipient_id, created_at desc);

-- ============================================================
-- 9) blocks
-- ============================================================
create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;
-- ไม่มี policy ตั้งใจ — ผ่าน RPC เท่านั้น (เฟส 4)

create index blocks_blocked_idx on public.blocks (blocked_id);
