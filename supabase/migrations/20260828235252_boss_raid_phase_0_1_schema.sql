-- Migration: 20260828170000_boss_raid_phase_0_1_schema
-- Classroom Boss Raid — Phase 0.1 (Schema + Room Lifecycle)
-- อ้างอิง: claude_classroom-boss-raid-design-2026-08-28-v2.md §11 (sub-phase 0.1), §12 (Connection Resilience)
--
-- ระบบใหม่แยกขาดจาก raid_* / quiz_attempts เดิม (solo turn-based) — ไม่ reuse ตารางเดิมใดๆ
-- ครูสร้างห้อง -> ได้ join_code -> นักเรียน login + join ผ่าน RPC (security definer) ->
-- ทุกจอ subscribe Supabase Realtime เห็น state ตรงกัน
--
-- เขียนได้เฉพาะ:
--   boss_raid_sessions       : ครูเจ้าของห้อง (INSERT ผ่าน RPC create_boss_raid_session, UPDATE ผ่าน RLS policy)
--   boss_raid_participants   : ผ่าน RPC join_boss_raid_session เท่านั้น (ไม่มี INSERT/UPDATE/DELETE policy)
--   boss_raid_answers        : ยังไม่ใช้จนถึง 0.3 — RLS enabled, deny-all ชั่วคราว

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) Tables
-- ============================================================
create table public.boss_raid_sessions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  join_code text not null unique,                 -- 6 หลัก A-Z0-9
  status text not null default 'lobby'
    check (status in ('lobby', 'in_progress', 'ended')),

  config jsonb not null default '{}'::jsonb,
  -- { chapter_ids: [...], difficulty: 'easy'|'medium'|'hard', timer_seconds: N }

  boss_hp integer,
  boss_hp_max integer,
  crystal_hp integer,
  crystal_hp_max integer,
  current_tier text default 'light'
    check (current_tier in ('light', 'medium', 'heavy')),

  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

comment on table public.boss_raid_sessions is
  'Classroom Boss Raid — 1 แถว = 1 ห้องเรียน. INSERT ผ่าน create_boss_raid_session(); UPDATE เฉพาะครูเจ้าของ.';

create table public.boss_raid_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.boss_raid_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id),
  stat_snapshot jsonb not null default '{}'::jsonb,  -- {hp,atk,def,spd,foc} รวม gear + clamp cap แล้ว ตอน join

  joined_at timestamptz not null default now(),

  current_question_id bigint references public.questions(id),
  question_started_at timestamptz,

  unique (session_id, user_id)
);

comment on table public.boss_raid_participants is
  'นักเรียนที่เข้าห้องแล้ว. เขียนได้เฉพาะผ่าน join_boss_raid_session() (security definer) — ไม่มี write policy ให้ client.';

create table public.boss_raid_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.boss_raid_sessions(id) on delete cascade,
  participant_id uuid not null references public.boss_raid_participants(id) on delete cascade,
  question_id bigint not null references public.questions(id),
  question_started_at timestamptz not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),

  unique (participant_id, question_id, question_started_at)
);

comment on table public.boss_raid_answers is
  'Log คำตอบ boss raid (แยกจาก quiz_attempts). ยังไม่ใช้จนถึง Phase 0.3 — RLS deny-all ชั่วคราว.';

-- FK / lookup indexes (ตาม convention: FK ทุกตัวมี index)
create index idx_boss_raid_sessions_teacher on public.boss_raid_sessions (teacher_id);
create index idx_boss_raid_participants_session on public.boss_raid_participants (session_id);
create index idx_boss_raid_participants_user on public.boss_raid_participants (user_id);
create index idx_boss_raid_participants_pet on public.boss_raid_participants (pet_id);
create index idx_boss_raid_participants_question on public.boss_raid_participants (current_question_id);
create index idx_boss_raid_answers_session on public.boss_raid_answers (session_id);
create index idx_boss_raid_answers_participant on public.boss_raid_answers (participant_id);
create index idx_boss_raid_answers_question on public.boss_raid_answers (question_id);

-- ============================================================
-- 2) Membership helper (SECURITY DEFINER — เลี่ยง RLS recursion ระหว่าง 2 ตาราง)
-- ============================================================
create or replace function public.is_boss_raid_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.boss_raid_sessions s
    where s.id = p_session_id and s.teacher_id = auth.uid()
  ) or exists (
    select 1 from public.boss_raid_participants p
    where p.session_id = p_session_id and p.user_id = auth.uid()
  );
$$;

comment on function public.is_boss_raid_member(uuid) is
  'true ถ้า auth.uid() เป็นครูเจ้าของห้อง หรือ participant ของห้องนี้. ใช้ใน RLS policy ของทั้ง 2 ตาราง (definer = ไม่ recursion).';

-- ============================================================
-- 3) RLS
-- ============================================================
alter table public.boss_raid_sessions enable row level security;
alter table public.boss_raid_participants enable row level security;
alter table public.boss_raid_answers enable row level security;

-- sessions: ครูเห็น/แก้ห้องตัวเอง; นักเรียนเห็นห้องที่ตัวเองเป็น participant
create policy "boss_raid_sessions: member select" on public.boss_raid_sessions
  for select using (teacher_id = auth.uid() or public.is_boss_raid_member(id));

create policy "boss_raid_sessions: teacher update" on public.boss_raid_sessions
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- ตั้งใจไม่มี INSERT/DELETE policy: สร้างห้องผ่าน create_boss_raid_session() เท่านั้น

-- participants: ทั้งครูและเพื่อนร่วมห้องเห็นกันได้ (sync จอทีวี)
create policy "boss_raid_participants: member select" on public.boss_raid_participants
  for select using (public.is_boss_raid_member(session_id));

-- ตั้งใจไม่มี write policy: join ผ่าน join_boss_raid_session() เท่านั้น

-- answers: deny-all (ยังไม่มี policy) จนถึง Phase 0.3

-- ============================================================
-- 4) join_code generator
-- ============================================================
create or replace function public.gen_boss_raid_join_code()
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
    select exists(select 1 from public.boss_raid_sessions where join_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

-- ============================================================
-- 5) create_boss_raid_session — ครูสร้างห้องใหม่
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

  insert into public.boss_raid_sessions (teacher_id, join_code, config)
  values (v_user_id, public.gen_boss_raid_join_code(), coalesce(p_config, '{}'::jsonb))
  returning * into v_session;

  return v_session;
end;
$$;

grant execute on function public.create_boss_raid_session(jsonb) to authenticated;

-- ============================================================
-- 6) join_boss_raid_session — นักเรียนเข้าห้อง (idempotent)
--    ดึง active pet + equipped gear ของ auth.uid() คำนวณ stat_snapshot ตอน join
--    clamp ตาม cap ของไข่ (egg_types.stat_profile->'caps') ให้ตรง logic ระบบ raid เดิม
-- ============================================================
create or replace function public.join_boss_raid_session(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.boss_raid_sessions;
  v_pet public.pets;
  v_caps jsonb;
  v_snapshot jsonb;
  v_participant public.boss_raid_participants;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select * into v_session
  from public.boss_raid_sessions
  where join_code = upper(btrim(p_join_code));

  if not found then
    raise exception 'ไม่พบรหัสห้องนี้';
  end if;

  if v_session.status not in ('lobby', 'in_progress') then
    raise exception 'ห้องนี้ปิดรับผู้เล่นแล้ว';
  end if;

  select * into v_participant
  from public.boss_raid_participants
  where session_id = v_session.id and user_id = v_user_id;

  if not found then
    select * into v_pet
    from public.pets
    where user_id = v_user_id and is_active = true
    limit 1;

    if not found then
      raise exception 'ยังไม่มีสัตว์เลี้ยงที่ใช้งานอยู่';
    end if;

    select stat_profile -> 'caps' into v_caps
    from public.egg_types where id = v_pet.egg_type_id;

    with gear as (
      select main_stat, main_value, sub_stat, sub_value
      from public.raid_gear_items
      where equipped_pet_id = v_pet.id
    ),
    axes(k, base) as (
      values
        ('hp',  coalesce(v_pet.stat_hp, 0)),
        ('atk', coalesce(v_pet.stat_atk, 0)),
        ('def', coalesce(v_pet.stat_def, 0)),
        ('spd', coalesce(v_pet.stat_spd, 0)),
        ('foc', coalesce(v_pet.stat_foc, 0))
    )
    select jsonb_object_agg(
      a.k,
      least(
        a.base
          + coalesce((select sum(g.main_value) from gear g where g.main_stat = a.k), 0)
          + coalesce((select sum(g.sub_value)  from gear g where g.sub_stat  = a.k), 0),
        coalesce((v_caps ->> a.k)::int, 2147483647)
      )
    ) into v_snapshot
    from axes a;

    insert into public.boss_raid_participants (session_id, user_id, pet_id, stat_snapshot)
    values (v_session.id, v_user_id, v_pet.id, v_snapshot)
    returning * into v_participant;
  end if;

  return jsonb_build_object(
    'session_id',    v_session.id,
    'status',        v_session.status,
    'join_code',     v_session.join_code,
    'config',        v_session.config,
    'participant_id', v_participant.id,
    'pet_id',        v_participant.pet_id,
    'stat_snapshot', v_participant.stat_snapshot
  );
end;
$$;

grant execute on function public.join_boss_raid_session(text) to authenticated;

-- ============================================================
-- 7) Realtime publication + replica identity — จอครู/ทีวี/นักเรียน subscribe ผ่าน RLS
-- ============================================================
alter publication supabase_realtime add table public.boss_raid_sessions;
alter publication supabase_realtime add table public.boss_raid_participants;

-- replica identity full: ให้ payload.old ของ UPDATE/DELETE ครบทุกคอลัมน์ (จำเป็นต่อการ
-- ประเมิน RLS ของ row เดิม และให้ client เห็น state เต็มทุก event ไม่ใช่แค่ PK)
alter table public.boss_raid_sessions replica identity full;
alter table public.boss_raid_participants replica identity full;

commit;

-- ============================================================
-- Rollback:
-- ============================================================
-- begin;
-- alter publication supabase_realtime drop table public.boss_raid_participants;
-- alter publication supabase_realtime drop table public.boss_raid_sessions;
-- drop function if exists public.join_boss_raid_session(text);
-- drop function if exists public.create_boss_raid_session(jsonb);
-- drop function if exists public.gen_boss_raid_join_code();
-- drop table if exists public.boss_raid_answers;
-- drop function if exists public.is_boss_raid_member(uuid);
-- drop table if exists public.boss_raid_participants;
-- drop table if exists public.boss_raid_sessions;
-- commit;
