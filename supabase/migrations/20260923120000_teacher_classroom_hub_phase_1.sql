-- Migration: 20260923120000_teacher_classroom_hub_phase_1
-- Teacher Classroom Hub Phase 1 — ห้องเรียน + สุ่มรายชื่อ + เปิด Boss Raid จากในห้อง
--
-- ยืนยันกับ live DB (wmndxiuqzrnqbhrznmfg) แล้วว่า create_boss_raid_session() มี hardcode
-- เช็ค auth.uid() = '792b8e1d-410c-4158-9c62-32b437b05121' (ปอนด์) อยู่จริง — เป็น hotfix ที่เคย
-- apply ตรงบน prod โดยไม่มี migration ไฟล์คู่กันในโค้ด (drift). จุดนี้คือจุดเดียวที่อนุมัติให้แก้
-- โค้ด Boss Raid เดิม (เปลี่ยน hardcode UUID เป็น is_teacher(v_user_id)) — ไฟล์/ฟังก์ชันอื่นของ
-- Boss Raid ห้ามแตะ รวมถึง src/lib/exp.ts และ src/lib/evolution.ts
--
-- Pattern ที่ mirror มาจาก boss_raid_sessions/participants (20260828235252):
--   - security-definer helper function (is_classroom_member) กัน RLS self-recursion
--   - เขียนได้เฉพาะผ่าน security-definer RPC เท่านั้น (ไม่มี insert/update policy ฝั่ง client)
--   - REPLICA IDENTITY FULL บนตารางที่ subscribe realtime — จำเป็นเมื่อ RLS เปิดอยู่ ไม่งั้น
--     Realtime จะ drop event เงียบๆ ไม่ error ที่ client เลย (บทเรียนจากบั๊ก TV realtime ของ
--     boss raid เมื่อ 2026-09-02 ดู docs/boss-raid-tv-realtime-issue-2026-09-02.md)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) teacher_allowlist
-- ============================================================
create table public.teacher_allowlist (
  user_id uuid primary key references auth.users(id),
  added_at timestamptz not null default now(),
  note text
);
alter table public.teacher_allowlist enable row level security;
-- ไม่มี client policy — เข้าถึงผ่าน is_teacher() (security definer) เท่านั้น

-- ============================================================
-- 2) is_teacher(uuid) — default auth.uid() ให้เรียกแบบ is_teacher() จาก client ได้
--    และเรียกแบบ is_teacher(v_user_id) จากใน create_boss_raid_session ได้ (#15)
-- ============================================================
create or replace function public.is_teacher(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.teacher_allowlist where user_id = p_user_id
  );
$$;

grant execute on function public.is_teacher(uuid) to authenticated;

-- ============================================================
-- 3) classroom_sessions (ยังไม่ใส่ policy — มาทีหลังใน #6)
-- ============================================================
create table public.classroom_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id),
  join_code text not null unique,
  status text not null default 'lobby'
    check (status in ('lobby', 'active', 'ended')),
  current_activity text
    check (current_activity is null or current_activity in ('name_picker', 'boss_raid')),
  active_boss_raid_session_id uuid references public.boss_raid_sessions(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table public.classroom_sessions enable row level security;

-- ============================================================
-- 4) classroom_participants
-- ============================================================
create table public.classroom_participants (
  session_id uuid not null references public.classroom_sessions(id),
  user_id uuid not null references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.classroom_participants enable row level security;

-- ============================================================
-- 5) is_classroom_member — ต้องมาหลัง classroom_participants (#4) ถูกสร้างแล้ว
--    (SQL-language function ถูก parse ตอน CREATE จึงต้องการให้ตารางที่อ้างถึงมีอยู่จริงก่อน)
-- ============================================================
create or replace function public.is_classroom_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.classroom_participants
    where session_id = p_session_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_classroom_member(uuid) to authenticated;

-- ============================================================
-- 6) RLS policy: classroom_sessions (member select)
-- ============================================================
create policy "classroom_sessions: member select"
  on public.classroom_sessions for select
  using (teacher_id = auth.uid() or public.is_classroom_member(id));

-- ============================================================
-- 7) RLS policy: classroom_participants (member select)
-- ============================================================
create policy "classroom_participants: member select"
  on public.classroom_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.classroom_sessions cs
      where cs.id = session_id and cs.teacher_id = auth.uid()
    )
  );

-- ============================================================
-- 8) classroom_name_picker_log (table + policy)
-- ============================================================
create table public.classroom_name_picker_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.classroom_sessions(id),
  picked_user_id uuid not null references auth.users(id),
  picked_at timestamptz not null default now()
);
alter table public.classroom_name_picker_log enable row level security;

create policy "classroom_name_picker_log: teacher select"
  on public.classroom_name_picker_log for select
  using (
    exists (
      select 1 from public.classroom_sessions cs
      where cs.id = session_id and cs.teacher_id = auth.uid()
    )
  );

-- ============================================================
-- 9) gen_classroom_join_code — mirror gen_boss_raid_join_code() แต่ query classroom_sessions
--    charset A-Z0-9 เต็ม (ไม่ใช้ md5(random()) เพราะ hex สุ่มได้แค่ 0-9a-f)
-- ============================================================
create or replace function public.gen_classroom_join_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    select exists(
      select 1 from public.classroom_sessions
      where join_code = v_code
    ) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

-- ============================================================
-- 10) RPCs: create_classroom_session / join_classroom_session /
--     end_classroom_session / set_classroom_activity_name_picker / pick_random_student
-- ============================================================
create or replace function public.create_classroom_session()
returns public.classroom_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_session public.classroom_sessions;
begin
  if not public.is_teacher() then
    raise exception 'not_authorized_teacher';
  end if;

  insert into public.classroom_sessions (teacher_id, join_code, status)
  values (auth.uid(), public.gen_classroom_join_code(), 'lobby')
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function public.create_classroom_session() to authenticated;

create or replace function public.join_classroom_session(p_join_code text)
returns public.classroom_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_session public.classroom_sessions;
begin
  select * into v_session
  from public.classroom_sessions
  where join_code = upper(p_join_code) and status <> 'ended';

  if v_session.id is null then
    raise exception 'classroom_not_found';
  end if;

  insert into public.classroom_participants (session_id, user_id)
  values (v_session.id, auth.uid())
  on conflict (session_id, user_id) do nothing;

  return v_session;
end;
$$;

grant execute on function public.join_classroom_session(text) to authenticated;

create or replace function public.end_classroom_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.classroom_sessions
  set status = 'ended', ended_at = now(), current_activity = null
  where id = p_session_id and teacher_id = auth.uid();

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
end;
$$;

grant execute on function public.end_classroom_session(uuid) to authenticated;

create or replace function public.set_classroom_activity_name_picker(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.classroom_sessions
  set current_activity = 'name_picker'
  where id = p_session_id and teacher_id = auth.uid() and status <> 'ended';

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
end;
$$;

grant execute on function public.set_classroom_activity_name_picker(uuid) to authenticated;

create or replace function public.pick_random_student(p_session_id uuid)
returns table (user_id uuid, username text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_picked uuid;
begin
  if not exists (
    select 1 from public.classroom_sessions
    where id = p_session_id and teacher_id = auth.uid()
  ) then
    raise exception 'not_authorized_or_not_found';
  end if;

  select cp.user_id into v_picked
  from public.classroom_participants cp
  where cp.session_id = p_session_id
  order by random()
  limit 1;

  if v_picked is null then
    raise exception 'no_participants';
  end if;

  insert into public.classroom_name_picker_log (session_id, picked_user_id)
  values (p_session_id, v_picked);

  return query
    select p.id, p.username from public.profiles p where p.id = v_picked;
end;
$$;

grant execute on function public.pick_random_student(uuid) to authenticated;

-- ============================================================
-- 11) get_boss_raid_join_code — นักเรียนใน classroom ยังไม่ใช่ boss_raid_participant มาก่อน
--     จึงยังไม่ผ่าน is_boss_raid_member(id) ของ RLS เดิม (ไม่แก้ policy เดิม แค่เพิ่ม RPC ใหม่)
-- ============================================================
create or replace function public.get_boss_raid_join_code(p_boss_raid_session_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_join_code text;
begin
  if not exists (
    select 1 from public.classroom_sessions cs
    where cs.active_boss_raid_session_id = p_boss_raid_session_id
      and public.is_classroom_member(cs.id)
  ) then
    raise exception 'not_authorized_or_not_found';
  end if;

  select join_code into v_join_code
  from public.boss_raid_sessions
  where id = p_boss_raid_session_id;

  return v_join_code;
end;
$$;

grant execute on function public.get_boss_raid_join_code(uuid) to authenticated;

-- ============================================================
-- 12) launch_boss_raid_from_classroom — เรียก create_boss_raid_session เดิม (ไม่แก้ signature เดิม)
--     ใช้ default config เดียวกับ src/app/boss-raid/actions.ts (DEFAULT_CONFIG) ไม่ใช่ '{}'::jsonb
--     เพราะ TV/lobby component เดิมคาดหวัง field พวกนี้อยู่แล้ว
-- ============================================================
create or replace function public.launch_boss_raid_from_classroom(
  p_session_id uuid,
  p_config jsonb default '{
    "chapter_ids": [],
    "difficulty": "medium",
    "timer_seconds": 30,
    "reward_egg_type_id": null,
    "reward_top_n": 5
  }'::jsonb
)
returns public.boss_raid_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_raid public.boss_raid_sessions;
begin
  if not exists (
    select 1 from public.classroom_sessions
    where id = p_session_id and teacher_id = auth.uid() and status <> 'ended'
  ) then
    raise exception 'not_authorized_or_not_found';
  end if;

  v_raid := public.create_boss_raid_session(p_config);

  update public.classroom_sessions
  set current_activity = 'boss_raid',
      active_boss_raid_session_id = v_raid.id
  where id = p_session_id;

  return v_raid;
end;
$$;

grant execute on function public.launch_boss_raid_from_classroom(uuid, jsonb) to authenticated;

-- ============================================================
-- 13) REPLICA IDENTITY FULL — จำเป็นสำหรับ Realtime เมื่อ RLS เปิดอยู่ (mirror boss_raid_sessions)
-- ============================================================
alter table public.classroom_sessions replica identity full;
alter table public.classroom_participants replica identity full;

-- ============================================================
-- 14) Realtime publication
-- ============================================================
alter publication supabase_realtime add table public.classroom_sessions;
alter publication supabase_realtime add table public.classroom_participants;

-- ============================================================
-- 15) create_boss_raid_session — จุดเดียวที่อนุมัติให้แก้โค้ด Boss Raid เดิม
--     เปลี่ยนจาก hardcode UUID (792b8e1d, ยืนยันแล้วว่ามีอยู่จริงบน prod) เป็น is_teacher(v_user_id)
--     ส่วนอื่นของ function คงเดิมทุกบรรทัด (คัดลอกจาก live pg_get_functiondef ตรงๆ)
-- ============================================================
create or replace function public.create_boss_raid_session(p_config jsonb default '{}'::jsonb)
returns public.boss_raid_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.boss_raid_sessions;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_teacher(v_user_id) then
    raise exception 'เฉพาะครูเท่านั้นที่สร้างห้องได้';
  end if;

  insert into public.boss_raid_sessions (teacher_id, join_code, config)
  values (v_user_id, public.gen_boss_raid_join_code(), coalesce(p_config, '{}'::jsonb))
  returning * into v_session;
  return v_session;
end;
$$;

grant execute on function public.create_boss_raid_session(jsonb) to authenticated;

-- ============================================================
-- 16) Backfill teacher_allowlist — กันปอนด์เสียสิทธิ์สร้างห้องระหว่างเปลี่ยนผ่าน
-- ============================================================
insert into public.teacher_allowlist (user_id, note)
values ('792b8e1d-410c-4158-9c62-32b437b05121'::uuid, 'migrated from hardcoded UUID in create_boss_raid_session')
on conflict (user_id) do nothing;

commit;

-- ============================================================
-- Rollback:
--   -- คืน create_boss_raid_session กลับ hardcode UUID เดิม (ดู pg_get_functiondef ก่อน apply)
--   alter publication supabase_realtime drop table public.classroom_participants;
--   alter publication supabase_realtime drop table public.classroom_sessions;
--   alter table public.classroom_participants replica identity default;
--   alter table public.classroom_sessions replica identity default;
--   drop function if exists public.launch_boss_raid_from_classroom(uuid, jsonb);
--   drop function if exists public.get_boss_raid_join_code(uuid);
--   drop function if exists public.pick_random_student(uuid);
--   drop function if exists public.set_classroom_activity_name_picker(uuid);
--   drop function if exists public.end_classroom_session(uuid);
--   drop function if exists public.join_classroom_session(text);
--   drop function if exists public.create_classroom_session();
--   drop function if exists public.gen_classroom_join_code();
--   drop table if exists public.classroom_name_picker_log;
--   drop policy if exists "classroom_participants: member select" on public.classroom_participants;
--   drop policy if exists "classroom_sessions: member select" on public.classroom_sessions;
--   drop function if exists public.is_classroom_member(uuid);
--   drop table if exists public.classroom_participants;
--   drop table if exists public.classroom_sessions;
--   drop function if exists public.is_teacher(uuid);
--   drop table if exists public.teacher_allowlist;
-- ============================================================
