-- Migration: guardian_profile_frames_schema_and_rewards
-- ระบบรางวัลผู้พิทักษ์ ส่วนที่ 1 — กรอบโปรไฟล์ (ยังไม่แตะไข่ egg_epic_02 เพราะชื่อ/artwork ยังไม่เคาะ)
-- ตาม §6.1, §6.2 ของเอกสารออกแบบ — เก็บแยกจากระบบ achievement เดิมตามที่สเปกกำชับ
--
-- schema เตรียมรองรับกรอบตาม season ในอนาคต (image_file + season เผื่อไว้) แม้ v1 นี้ยังไม่มี
-- artwork จริง (placeholder — ปอนด์จะไปออกแบบเองแล้ว insert แถวใหม่ทีหลังโดยไม่ต้องแก้โค้ด)
--
-- Trigger points (ทั้งคู่ non-fatal/best-effort เหมือน pattern เดิมของ guardian feature):
--   1. guardian_check_weekly_goal_reward() — เรียกจาก finishQuizRound() (src/app/quiz/actions.ts,
--      ต่อสายแล้วในแพตช์แยก) ให้กรอบพื้นฐาน(ครั้งแรก)/กรอบกลาง(ครบ 4 สัปดาห์ ไม่ต้องติดกัน) §6.1
--   2. guardian_advance_plan_if_passed() (มีอยู่แล้ว, แก้เพิ่ม) — ให้กรอบพิเศษตอนจบแผนทั้งชุด
--
-- ไข่ egg_epic_02: จุดที่ควรเติมทีหลัง (ไม่ต้องแก้ที่อื่น) คือใน guardian_advance_plan_if_passed
-- ตรง "ผ่านทุก 2 บท" — ยังไม่ได้เขียนโค้ดส่วนนั้นเลยในไฟล์นี้ รอชื่อ/artwork ก่อน

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) ตารางนิยามกรอบ — รองรับ season ในอนาคต, placeholder image_file ไปก่อน
-- ============================================================
create table if not exists public.frame_definitions (
  id text primary key,
  name text not null,
  tier text not null check (tier in ('basic', 'mid', 'special')),
  season text,
  image_file text,
  sort_order integer not null default 0
);

insert into public.frame_definitions (id, name, tier, sort_order) values
  ('guardian_basic', 'กรอบพื้นฐาน', 'basic', 10),
  ('guardian_mid', 'กรอบระดับกลาง', 'mid', 20),
  ('guardian_special', 'กรอบพิเศษ', 'special', 30)
on conflict (id) do nothing;

alter table public.frame_definitions enable row level security;

drop policy if exists frame_definitions_select_all on public.frame_definitions;
create policy frame_definitions_select_all on public.frame_definitions
  for select using (true);

-- ============================================================
-- 2) กรอบที่ผู้เล่นแต่ละคนปลดล็อกแล้ว
-- ============================================================
create table if not exists public.user_profile_frames (
  user_id uuid not null references auth.users(id) on delete cascade,
  frame_id text not null references public.frame_definitions(id),
  unlocked_at timestamptz not null default now(),
  source text,
  primary key (user_id, frame_id)
);

alter table public.user_profile_frames enable row level security;

drop policy if exists user_profile_frames_select_own on public.user_profile_frames;
create policy user_profile_frames_select_own on public.user_profile_frames
  for select using (auth.uid() = user_id);

-- ============================================================
-- 3) กรอบที่กำลังใส่อยู่ — เพิ่มคอลัมน์ใน profile_settings ตามที่สเปกบอก (§6.2 "ที่เก็บ")
-- ============================================================
alter table public.profile_settings
  add column if not exists equipped_frame_id text references public.frame_definitions(id);

-- ============================================================
-- 4) log สัปดาห์ที่ทำเป้าสำเร็จ (ไม่ต้องติดกัน) — ใช้นับว่าครบ 4 ครั้งหรือยังสำหรับกรอบกลาง
-- ============================================================
create table if not exists public.guardian_goal_reached_weeks (
  student_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  reached_at timestamptz not null default now(),
  primary key (student_id, week_start)
);

alter table public.guardian_goal_reached_weeks enable row level security;

drop policy if exists guardian_goal_reached_weeks_select_own on public.guardian_goal_reached_weeks;
create policy guardian_goal_reached_weeks_select_own on public.guardian_goal_reached_weeks
  for select using (auth.uid() = student_id);

-- ============================================================
-- 5) grant_profile_frame — primitive ให้กรอบ, idempotent, "unlock อะไรก็ได้" จึงต้อง
--    revoke EXECUTE ออกจาก authenticated/anon ทันที เรียกได้แค่จากฟังก์ชัน SECURITY DEFINER
--    อื่นที่ owner เดียวกันเท่านั้น (ภายใน call ไม่เช็ค grant ของ caller เดิม)
-- ============================================================
create or replace function public.grant_profile_frame(p_user_id uuid, p_frame_id text, p_source text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.user_profile_frames (user_id, frame_id, source)
  values (p_user_id, p_frame_id, p_source)
  on conflict (user_id, frame_id) do nothing;
end;
$$;

revoke all on function public.grant_profile_frame(uuid, text, text) from public, anon, authenticated;

-- ============================================================
-- 6) get_my_frames — ผู้เล่นดูกรอบตัวเองสำหรับหน้าเลือกกรอบ (coalesce กัน is_equipped เป็น null
--    ตอนยังไม่มีกรอบไหนใส่อยู่เลย — แก้เพิ่มหลัง apply รอบแรกไปแล้ว)
-- ============================================================
create or replace function public.get_my_frames()
returns table (
  id text,
  tier text,
  frame_name text,
  is_unlocked boolean,
  is_equipped boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_equipped text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select ps.equipped_frame_id into v_equipped from public.profile_settings ps where ps.user_id = v_uid;

  return query
  select
    fd.id,
    fd.tier,
    fd.name,
    exists (select 1 from public.user_profile_frames upf where upf.user_id = v_uid and upf.frame_id = fd.id),
    coalesce(fd.id = v_equipped, false)
  from public.frame_definitions fd
  order by fd.sort_order;
end;
$$;

-- ============================================================
-- 7) set_equipped_frame — ผู้เล่นเปลี่ยนกรอบที่ใส่เอง (ต้องปลดล็อกแล้วเท่านั้น)
-- ============================================================
create or replace function public.set_equipped_frame(p_frame_id text)
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

  if p_frame_id is not null and not exists (
    select 1 from public.user_profile_frames upf
    where upf.user_id = v_uid and upf.frame_id = p_frame_id
  ) then
    raise exception 'ยังไม่ได้ปลดล็อกกรอบนี้';
  end if;

  insert into public.profile_settings (user_id, equipped_frame_id)
  values (v_uid, p_frame_id)
  on conflict (user_id) do update set equipped_frame_id = excluded.equipped_frame_id;
end;
$$;

-- ============================================================
-- 8) guardian_check_weekly_goal_reward — เรียกจาก finishQuizRound() เช็คว่าข้ามเป้าสัปดาห์นี้
--    หรือยัง ให้กรอบทันทีที่ข้ามเส้นครั้งแรก/ครบ 4 ครั้ง ตาม §6.1, §5.8 (ให้ทันที ไม่รอสิ้นสัปดาห์
--    ไม่ต้องมี cron)
-- ============================================================
create or replace function public.guardian_check_weekly_goal_reward()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_goal public.guardian_goal;
  v_total_points integer;
  v_inserted public.guardian_goal_reached_weeks;
  v_total_reached integer;
begin
  if v_uid is null then
    return;
  end if;

  select wb.week_start_date into v_week_start from public.current_week_bounds_bkk() wb;

  select * into v_goal from public.guardian_goal
  where student_id = v_uid and week_start = v_week_start;

  if not found then
    return;
  end if;

  select coalesce(sum(d.day_points), 0) into v_total_points
  from public.guardian_daily_points_bkk(v_uid, v_week_start) d;

  if v_total_points < v_goal.computed_target then
    return;
  end if;

  insert into public.guardian_goal_reached_weeks (student_id, week_start)
  values (v_uid, v_week_start)
  on conflict do nothing
  returning * into v_inserted;

  if v_inserted.student_id is null then
    return;
  end if;

  select count(*) into v_total_reached
  from public.guardian_goal_reached_weeks ggw
  where ggw.student_id = v_uid;

  if v_total_reached = 1 then
    perform public.grant_profile_frame(v_uid, 'guardian_basic', 'guardian_goal_first_week');
  elsif v_total_reached = 4 then
    perform public.grant_profile_frame(v_uid, 'guardian_mid', 'guardian_goal_4_weeks');
  end if;
end;
$$;

-- ============================================================
-- 9) guardian_advance_plan_if_passed — แก้เพิ่ม: จบแผนทั้งชุด → กรอบพิเศษ (§6.1)
--    signature/return type เดิมทุกอย่าง ไม่กระทบ finishQuizRound ที่เรียกอยู่แล้ว
-- ============================================================
create or replace function public.guardian_advance_plan_if_passed(p_student_id uuid)
returns table(affected_chapter_key text, new_status text, promoted_chapter_key text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_plan public.guardian_plan;
  v_current public.guardian_plan_chapters;
  v_cc public.curriculum_chapters;
  v_total_attempts integer;
  v_recent_correct integer;
  v_recent_count integer;
  v_passed boolean := false;
  v_stuck boolean := false;
  v_next_key text;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if v_uid <> p_student_id then
    raise exception 'เรียกได้เฉพาะตัวนักเรียนเจ้าของบัญชีเท่านั้น';
  end if;

  select * into v_plan from public.guardian_plan
  where student_id = p_student_id and status = 'active';

  if not found then
    return;
  end if;

  select * into v_current from public.guardian_plan_chapters
  where plan_id = v_plan.id and status = 'current';

  if not found then
    return;
  end if;

  select * into v_cc from public.curriculum_chapters where chapter_key = v_current.chapter_key;

  select count(*) into v_total_attempts
  from public.quiz_attempts qa
  join public.questions q on q.id = qa.question_id
  where qa.user_id = p_student_id
    and qa.source is null
    and q.subject = v_cc.subject
    and (q.branch is not distinct from v_cc.branch)
    and q.grade_band = v_cc.grade_band
    and q.chapter = v_cc.chapter;

  select count(*) filter (where sub.is_correct), count(*)
    into v_recent_correct, v_recent_count
  from (
    select qa.is_correct
    from public.quiz_attempts qa
    join public.questions q on q.id = qa.question_id
    where qa.user_id = p_student_id
      and qa.source is null
      and q.subject = v_cc.subject
      and (q.branch is not distinct from v_cc.branch)
      and q.grade_band = v_cc.grade_band
      and q.chapter = v_cc.chapter
    order by qa.created_at desc
    limit 15
  ) sub;

  if v_total_attempts >= 20 and v_recent_count > 0
     and v_recent_correct::numeric / v_recent_count >= 0.70 then
    v_passed := true;
  elsif v_current.entered_current_at is not null
    and v_current.entered_current_at < now() - interval '14 days' then
    v_stuck := true;
  end if;

  if v_passed then
    update public.guardian_plan_chapters
    set status = 'passed', passed_at = now()
    where id = v_current.id;
  elsif v_stuck and v_current.status <> 'stuck' then
    update public.guardian_plan_chapters
    set status = 'stuck'
    where id = v_current.id;
  else
    return query select v_current.chapter_key, v_current.status, null::text;
    return;
  end if;

  select gpc.chapter_key into v_next_key
  from public.guardian_plan_chapters gpc
  where gpc.plan_id = v_plan.id and gpc.status = 'pending'
  order by gpc.queue_order
  limit 1;

  if v_next_key is not null then
    update public.guardian_plan_chapters
    set status = 'current', entered_current_at = now()
    where plan_id = v_plan.id and chapter_key = v_next_key;
  else
    update public.guardian_plan
    set status = 'completed'
    where id = v_plan.id;

    -- ใหม่: จบแผนทั้งชุด → กรอบพิเศษ (§6.1) — best-effort ภายในฟังก์ชันที่ non-fatal อยู่แล้ว
    perform public.grant_profile_frame(p_student_id, 'guardian_special', 'guardian_plan_complete');
  end if;

  return query select v_current.chapter_key, (case when v_passed then 'passed' else 'stuck' end), v_next_key;
end;
$function$;

-- ============================================================
-- 10) get_public_profile — แก้เพิ่ม: โชว์กรอบที่คนอื่นใส่อยู่ (§6.2 "โชว์ในหน้าสังคมปกติ
--     ไม่บอกที่มา") DROP ก่อนเพราะเพิ่มคอลัมน์ผล
-- ============================================================
drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(p_target_user_id uuid)
returns table(
  found boolean, relationship_status text, target_user_id uuid, username text,
  pet_nickname text, pet_stage integer, pet_subline text, pet_personality text,
  egg_sprite_prefix text, egg_name_th text,
  stat_hp integer, stat_atk integer, stat_def integer, stat_spd integer, stat_foc integer,
  medals jsonb, like_count integer, liked_by_me boolean,
  equipped_frame_id text, equipped_frame_tier text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_pride_pet_id uuid;
begin
  if v_me is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text,
      null::int, null::int, null::int, null::int, null::int, null::jsonb, null::int, null::boolean, null::text, null::text;
    return;
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_target_user_id) or (blocker_id = p_target_user_id and blocked_id = v_me)
  ) then
    return query select false, null::text, null::uuid, null::text, null::text, null::int, null::text, null::text, null::text, null::text,
      null::int, null::int, null::int, null::int, null::int, null::jsonb, null::int, null::boolean, null::text, null::text;
    return;
  end if;

  select ps.pride_pet_id into v_pride_pet_id from public.profile_settings ps where ps.user_id = p_target_user_id;
  if v_pride_pet_id is null then
    select p.id into v_pride_pet_id from public.pets p where p.user_id = p_target_user_id and p.is_active = true limit 1;
  end if;

  return query
  select
    true,
    public._compute_relationship_status(v_me, p_target_user_id),
    p_target_user_id,
    pr.username,
    pt.nickname, pt.stage::int, pt.subline, pt.personality, et.sprite_prefix, et.name_th,
    pt.stat_hp, pt.stat_atk, pt.stat_def, pt.stat_spd, pt.stat_foc,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ad.id, 'name', ad.name, 'tier', ad.tier, 'imageFile', ad.image_file) order by upa.pin_order)
      from public.user_pinned_achievements upa
      join public.achievement_definitions ad on ad.id = upa.achievement_id
      where upa.user_id = p_target_user_id
    ), '[]'::jsonb),
    (select count(*)::int from public.profile_likes where profile_user_id = p_target_user_id),
    exists (select 1 from public.profile_likes where liker_id = v_me and profile_user_id = p_target_user_id),
    target_ps.equipped_frame_id,
    fd.tier
  from public.profiles pr
  left join public.pets pt on pt.id = v_pride_pet_id
  left join public.egg_types et on et.id = pt.egg_type_id
  left join public.profile_settings target_ps on target_ps.user_id = p_target_user_id
  left join public.frame_definitions fd on fd.id = target_ps.equipped_frame_id
  where pr.id = p_target_user_id;
end;
$function$;

comment on function public.get_public_profile(uuid) is
  'เพิ่ม equipped_frame_id/equipped_frame_tier (2026-09-16) ให้หน้าโปรไฟล์คนอื่นโชว์กรอบผู้พิทักษ์ '
  'ตาม §6.2 — ไม่บอกที่มาของกรอบ.';

commit;
