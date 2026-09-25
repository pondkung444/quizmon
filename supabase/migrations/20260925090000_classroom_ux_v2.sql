-- Migration: 20260925090000_classroom_ux_v2
-- ห้องเรียน UX รอบ 2 — ของที่ขายครู/โรงเรียน
--
--   1) รหัสห้องเป็นตัวเลขล้วน 6 หลัก — เดิม A-Z0-9 ทำให้นักเรียนงง 0/O, 1/I/L และมือถือนักเรียนไทย
--      เปิดคีย์บอร์ดไทยเป็นค่าเริ่มต้น ต้องสลับภาษา+สลับหน้าตัวเลข. ตัวเลขล้วน = inputMode numeric
--      ห้องเก่าที่เป็นตัวอักษรยังเข้าได้ตามเดิม (join normalize ทั้งสองแบบ) จนหมดอายุ
--   2) unique เฉพาะห้องที่ยังเปิด (partial index) + ห้องหมดอายุเอง 12 ชม. หลังสร้าง
--      (ครูลืมกดปิดห้องบ่อย ห้องค้าง lobby ตลอดไปแล้วกินรหัส)
--   3) ชื่อจริง + เลขที่ ต่อห้อง (classroom_participants) — username เป็นชื่อเล่นที่เด็กตั้งเอง ครูไม่รู้ว่าใคร
--      prefill จากห้องล่าสุดของครูคนเดียวกันตอน join → เด็กไม่ต้องกรอกซ้ำทุกคาบ
--   4) get_classroom_roster — ครูเห็นชื่อ + Qmon ตัวที่ใช้งาน (RLS ไม่ให้ครูอ่าน pets ของเด็กตรงๆ)
--      สมาชิกห้องเรียกได้ด้วยแต่ชื่อจริง/เลขที่ของคนอื่นถูก mask เป็น null
--   5) นำนักเรียนออกจากห้อง (classroom_kicked กันเข้าซ้ำด้วยรหัสเดิม)
--   6) ชื่อห้อง (title) ให้ครูแยกห้องออกในหน้ารายการ
--   7) pick_random_student รับรายชื่อผู้สมัคร (คนที่ออนไลน์อยู่ ตาม Presence ฝั่งครู) + คืนชื่อจริง

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) รหัสห้อง: unique เฉพาะห้องที่ยังไม่จบ
-- ============================================================
alter table public.classroom_sessions drop constraint classroom_sessions_join_code_key;
create unique index classroom_sessions_join_code_open_uidx
  on public.classroom_sessions (join_code)
  where status <> 'ended';

-- ============================================================
-- 2) คอลัมน์ใหม่
-- ============================================================
alter table public.classroom_sessions
  add column title text check (title is null or char_length(title) between 1 and 60);

alter table public.classroom_participants
  add column display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  add column student_number smallint check (student_number is null or student_number between 1 and 99);

create table public.classroom_kicked (
  session_id uuid not null references public.classroom_sessions(id),
  user_id uuid not null references auth.users(id),
  kicked_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.classroom_kicked enable row level security;
-- ไม่มี client policy — ใช้ภายใน RPC เท่านั้น

-- ============================================================
-- 3) หมดอายุห้องค้าง (เรียกจาก create/join — ไม่ต้องมี cron)
-- ============================================================
create or replace function public.expire_stale_classroom_sessions()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.classroom_sessions
  set status = 'ended', ended_at = now(), current_activity = null
  where status <> 'ended' and created_at < now() - interval '12 hours';
$$;

revoke all on function public.expire_stale_classroom_sessions() from public, anon, authenticated;

-- ============================================================
-- 4) gen_classroom_join_code — ตัวเลขล้วน 6 หลัก, ซ้ำได้กับห้องที่จบแล้ว
-- ============================================================
create or replace function public.gen_classroom_join_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text;
begin
  loop
    v_code := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (
      select 1 from public.classroom_sessions
      where join_code = v_code and status <> 'ended'
    );
  end loop;
  return v_code;
end;
$$;

-- ============================================================
-- 5) create_classroom_session(p_title) — แทนตัวเดิมที่ไม่มีพารามิเตอร์
-- ============================================================
drop function if exists public.create_classroom_session();

create or replace function public.create_classroom_session(p_title text default null)
returns public.classroom_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_session public.classroom_sessions;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
begin
  if not public.is_teacher() then
    raise exception 'not_authorized_teacher';
  end if;

  perform public.expire_stale_classroom_sessions();

  insert into public.classroom_sessions (teacher_id, join_code, status, title)
  values (auth.uid(), public.gen_classroom_join_code(), 'lobby', left(v_title, 60))
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function public.create_classroom_session(text) to authenticated;

create or replace function public.rename_classroom_session(p_session_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.classroom_sessions
  set title = left(nullif(btrim(coalesce(p_title, '')), ''), 60)
  where id = p_session_id and teacher_id = auth.uid();

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
end;
$$;

grant execute on function public.rename_classroom_session(uuid, text) to authenticated;

-- ============================================================
-- 6) join_classroom_session — normalize รหัส, เช็คหมดอายุ/ถูกนำออก, prefill ชื่อ+เลขที่
-- ============================================================
create or replace function public.join_classroom_session(p_join_code text)
returns public.classroom_sessions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_session public.classroom_sessions;
  v_code text := regexp_replace(upper(coalesce(p_join_code, '')), '[^A-Z0-9]', '', 'g');
  v_name text;
  v_number smallint;
begin
  perform public.expire_stale_classroom_sessions();

  select * into v_session
  from public.classroom_sessions
  where join_code = v_code and status <> 'ended';

  if v_session.id is null then
    raise exception 'classroom_not_found';
  end if;

  if exists (
    select 1 from public.classroom_kicked
    where session_id = v_session.id and user_id = auth.uid()
  ) then
    raise exception 'classroom_kicked';
  end if;

  -- prefill: ชื่อจากห้องล่าสุดที่เคยกรอก, เลขที่เฉพาะห้องของครูคนเดิม (ครูคนอื่น = ห้อง/เลขที่อื่น)
  select cp.display_name into v_name
  from public.classroom_participants cp
  where cp.user_id = auth.uid() and cp.display_name is not null
  order by cp.joined_at desc
  limit 1;

  select cp.student_number into v_number
  from public.classroom_participants cp
  join public.classroom_sessions cs on cs.id = cp.session_id
  where cp.user_id = auth.uid()
    and cs.teacher_id = v_session.teacher_id
    and cp.student_number is not null
  order by cp.joined_at desc
  limit 1;

  insert into public.classroom_participants (session_id, user_id, display_name, student_number)
  values (v_session.id, auth.uid(), v_name, v_number)
  on conflict (session_id, user_id) do nothing;

  return v_session;
end;
$$;

grant execute on function public.join_classroom_session(text) to authenticated;

-- ============================================================
-- 7) set_classroom_identity — นักเรียนตั้งชื่อจริง/เลขที่ของตัวเองในห้องนี้
--    (กรองคำหยาบทำที่ server action ก่อนเรียก — ดู src/app/classroom/actions.ts)
-- ============================================================
create or replace function public.set_classroom_identity(
  p_session_id uuid,
  p_display_name text,
  p_student_number smallint default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'invalid_display_name';
  end if;
  if p_student_number is not null and (p_student_number < 1 or p_student_number > 99) then
    raise exception 'invalid_student_number';
  end if;

  update public.classroom_participants
  set display_name = v_name, student_number = p_student_number
  where session_id = p_session_id and user_id = auth.uid();

  if not found then
    raise exception 'not_authorized_or_not_found';
  end if;
end;
$$;

grant execute on function public.set_classroom_identity(uuid, text, smallint) to authenticated;

-- ============================================================
-- 8) get_classroom_roster — รายชื่อ + Qmon ตัวที่ใช้งาน
-- ============================================================
create or replace function public.get_classroom_roster(p_session_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  student_number smallint,
  joined_at timestamptz,
  pet_nickname text,
  pet_stage smallint,
  pet_subline text,
  pet_personality text,
  pet_sprite_prefix text,
  pet_egg_name_th text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_is_teacher boolean;
begin
  select exists (
    select 1 from public.classroom_sessions
    where id = p_session_id and teacher_id = auth.uid()
  ) into v_is_teacher;

  if not v_is_teacher and not public.is_classroom_member(p_session_id) then
    raise exception 'not_authorized_or_not_found';
  end if;

  return query
    select
      cp.user_id,
      pr.username,
      case when v_is_teacher or cp.user_id = auth.uid() then cp.display_name end,
      case when v_is_teacher or cp.user_id = auth.uid() then cp.student_number end,
      cp.joined_at,
      pet.nickname,
      pet.stage,
      pet.subline,
      pet.personality,
      et.sprite_prefix,
      et.name_th
    from public.classroom_participants cp
    left join public.profiles pr on pr.id = cp.user_id
    left join lateral (
      select p.nickname, p.stage, p.subline, p.personality, p.egg_type_id
      from public.pets p
      where p.user_id = cp.user_id and p.is_active
      limit 1
    ) pet on true
    left join public.egg_types et on et.id = pet.egg_type_id
    where cp.session_id = p_session_id
    order by cp.joined_at desc;
end;
$$;

grant execute on function public.get_classroom_roster(uuid) to authenticated;

-- ============================================================
-- 9) kick_classroom_participant
-- ============================================================
create or replace function public.kick_classroom_participant(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.classroom_sessions
    where id = p_session_id and teacher_id = auth.uid()
  ) then
    raise exception 'not_authorized_or_not_found';
  end if;

  delete from public.classroom_participants
  where session_id = p_session_id and user_id = p_user_id;

  insert into public.classroom_kicked (session_id, user_id)
  values (p_session_id, p_user_id)
  on conflict do nothing;
end;
$$;

grant execute on function public.kick_classroom_participant(uuid, uuid) to authenticated;

-- ============================================================
-- 10) pick_random_student — เปลี่ยน return type ต้อง drop ก่อน
--     p_candidate_ids = คนที่ออนไลน์อยู่ (Presence ฝั่งครู). ถ้ากรองแล้วว่าง fallback ทั้งห้อง
-- ============================================================
drop function if exists public.pick_random_student(uuid);

create or replace function public.pick_random_student(
  p_session_id uuid,
  p_candidate_ids uuid[] default null
)
returns table (user_id uuid, username text, display_name text, student_number smallint)
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

  if p_candidate_ids is not null and cardinality(p_candidate_ids) > 0 then
    select cp.user_id into v_picked
    from public.classroom_participants cp
    where cp.session_id = p_session_id and cp.user_id = any (p_candidate_ids)
    order by random()
    limit 1;
  end if;

  if v_picked is null then
    select cp.user_id into v_picked
    from public.classroom_participants cp
    where cp.session_id = p_session_id
    order by random()
    limit 1;
  end if;

  if v_picked is null then
    raise exception 'no_participants';
  end if;

  insert into public.classroom_name_picker_log (session_id, picked_user_id)
  values (p_session_id, v_picked);

  return query
    select cp.user_id, pr.username, cp.display_name, cp.student_number
    from public.classroom_participants cp
    left join public.profiles pr on pr.id = cp.user_id
    where cp.session_id = p_session_id and cp.user_id = v_picked;
end;
$$;

grant execute on function public.pick_random_student(uuid, uuid[]) to authenticated;

commit;

-- ============================================================
-- Rollback:
--   drop function if exists public.pick_random_student(uuid, uuid[]);
--   -- สร้าง pick_random_student(uuid) เดิมคืน (ดู 20260923120000 ข้อ 10)
--   drop function if exists public.kick_classroom_participant(uuid, uuid);
--   drop function if exists public.get_classroom_roster(uuid);
--   drop function if exists public.set_classroom_identity(uuid, text, smallint);
--   -- join_classroom_session / gen_classroom_join_code: คืนตัวเดิมจาก 20260923120000
--   drop function if exists public.rename_classroom_session(uuid, text);
--   drop function if exists public.create_classroom_session(text);
--   -- สร้าง create_classroom_session() เดิมคืน
--   drop function if exists public.expire_stale_classroom_sessions();
--   drop table if exists public.classroom_kicked;
--   alter table public.classroom_participants drop column student_number, drop column display_name;
--   alter table public.classroom_sessions drop column title;
--   drop index if exists public.classroom_sessions_join_code_open_uidx;
--   alter table public.classroom_sessions add constraint classroom_sessions_join_code_key unique (join_code);
--     (ใช้ได้เฉพาะเมื่อยังไม่มีรหัสซ้ำกับห้องที่จบแล้ว)
-- ============================================================
