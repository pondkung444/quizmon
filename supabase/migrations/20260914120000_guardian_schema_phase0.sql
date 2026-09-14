-- Migration: 20260914120000_guardian_schema_phase0
-- Guardian (ผู้ปกครอง) — Phase 0: schema bootstrap
-- อ้างอิง: quizmon-guardian-design-2026-09-09.md ส่วนที่ 15
--
-- ขอบเขต: guardians, guardian_links (invite code), guardian_plan, guardian_goal,
-- guardian_admin (feature allowlist แบบเดียวกับ pvp_allowlist/raid_allowlist),
-- push_preferences.guardian_enabled, handle_new_user() early-return สำหรับ guardian signup,
-- และ RPC ชุด guardian_get_* / guardian_claim_* (gate ด้วย guardian_admin เสมอ — RPC layer;
-- ต้องกัน UI layer เพิ่มตอน build หน้า /guardian ด้วย ไม่ใช่พึ่ง RPC gate อย่างเดียว)
--
-- ทุก object ใช้ IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS ให้ idempotent
-- (บทเรียนจาก schema drift ล่าสุด — object ที่คิดว่ายังไม่มี อาจมีอยู่แล้วในบาง state)
--
-- หมายเหตุ (survey ก่อนร่าง): free-play question selection (startQuizRound ใน
-- src/app/quiz/actions.ts) เป็น Next.js server action เรียก Supabase ตรงด้วย admin client
-- ไม่ใช่ RPC — ดังนั้นการ "แทรกคำถามจากแผน 50%" ต้อง implement ที่ TypeScript ฟังก์ชันนี้ ไม่ใช่ DB
-- function. และ category<->chapter ไม่มี mapping table ที่ runtime app ใช้ได้จริง (มีแค่
-- question_factory_category_registry ซึ่ง service-role/Factory-only, ไม่ใช่สำหรับ gameplay) —
-- guardian_goal จึงอิงหน่วยเดียวกับ missions (subject + category) แทน chapter เพื่อให้ผูกกับ
-- filter ที่ startQuizRound ใช้อยู่แล้วได้ตรงๆ โดยไม่ต้องสร้าง bridge table ใหม่
-- **สมมติฐานนี้รอ confirm** — ถ้าต้องการ target เป็น chapter แทน ต้องออกแบบใหม่

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) guardians — บัญชีผู้ปกครอง (สมัครผ่าน auth.users เหมือน profiles)
-- ============================================================
create table if not exists public.guardians (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_guardians_set_updated_at on public.guardians;
create trigger trg_guardians_set_updated_at
  before update on public.guardians
  for each row
  execute function public.set_updated_at();

alter table public.guardians enable row level security;

drop policy if exists "guardians_select_own" on public.guardians;
create policy "guardians_select_own" on public.guardians
  for select using (auth.uid() = id);

drop policy if exists "guardians_update_own" on public.guardians;
create policy "guardians_update_own" on public.guardians
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ไม่มี insert policy ให้ client — insert ทำผ่าน handle_new_user() (security definer) เท่านั้น

comment on table public.guardians is
  'บัญชีผู้ปกครอง แยกจาก public.profiles (ซึ่งเป็นบัญชีนักเรียน) — สมัครผ่าน auth.users เหมือนกัน '
  'แต่ handle_new_user() แยกเส้นทาง insert ตาม raw_user_meta_data->>''account_type''.';

-- ============================================================
-- 2) guardian_links — เชื่อมผู้ปกครอง<->นักเรียนด้วยรหัสเชิญ 8 ตัวอักษร
--    นักเรียนเป็นฝั่งสร้างรหัส (เจ้าของบัญชี) ผู้ปกครองเป็นฝั่งกรอกรหัสเพื่อเชื่อม
--    หมดอายุ 24 ชม. ใช้ได้ครั้งเดียว (status: pending -> claimed/expired/revoked)
-- ============================================================
create table if not exists public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  guardian_id uuid references public.guardians(id) on delete cascade,
  invite_code text not null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint guardian_links_invite_code_format check (invite_code ~ '^[A-Z2-9]{8}$'),
  constraint guardian_links_claimed_consistency
    check ((status = 'claimed') = (guardian_id is not null and claimed_at is not null))
);

-- รหัสยังไม่ claim ต้อง unique กันชนกันตอนสุ่ม (claim แล้วปล่อยเลขซ้ำได้ในอนาคตไม่เป็นไร
-- เพราะ deactivated แล้ว) — partial unique index บน pending เท่านั้น
create unique index if not exists guardian_links_invite_code_pending_uidx
  on public.guardian_links (invite_code)
  where status = 'pending';

create index if not exists guardian_links_student_idx
  on public.guardian_links (student_id);

create index if not exists guardian_links_guardian_idx
  on public.guardian_links (guardian_id)
  where guardian_id is not null;

drop trigger if exists trg_guardian_links_set_updated_at on public.guardian_links;
create trigger trg_guardian_links_set_updated_at
  before update on public.guardian_links
  for each row
  execute function public.set_updated_at();

alter table public.guardian_links enable row level security;

drop policy if exists "guardian_links_select_own" on public.guardian_links;
create policy "guardian_links_select_own" on public.guardian_links
  for select using (auth.uid() = student_id or auth.uid() = guardian_id);

-- ไม่มี insert/update policy ให้ client — สร้าง/claim ผ่าน guardian_* RPC (security definer) เท่านั้น
-- เพื่อบังคับ business rule (หมดอายุ, ใช้ครั้งเดียว, format รหัส) ที่ชั้นเดียว ไม่ให้ client เขียนตรง

comment on table public.guardian_links is
  'เชื่อมผู้ปกครอง<->นักเรียนด้วยรหัสเชิญ 8 ตัว (A-Z, 2-9 กันสับสน 0/O 1/I) หมดอายุ 24 ชม. ใช้ครั้งเดียว. '
  'นักเรียนสร้างรหัส (guardian_id null) ผู้ปกครองกรอกรหัส claim (เซ็ต guardian_id + claimed_at).';

-- ============================================================
-- 3) guardian_plan / guardian_goal — แผนฝึกที่ผู้ปกครองตั้งให้นักเรียนที่ลิงก์แล้ว
--    goal อ้างอิง subject + category (หน่วยเดียวกับ missions ไม่ใช่ chapter — ดูหมายเหตุด้านบน)
-- ============================================================
create table if not exists public.guardian_plan (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guardian_plan_student_active_idx
  on public.guardian_plan (student_id)
  where is_active;

create index if not exists guardian_plan_guardian_idx
  on public.guardian_plan (guardian_id);

drop trigger if exists trg_guardian_plan_set_updated_at on public.guardian_plan;
create trigger trg_guardian_plan_set_updated_at
  before update on public.guardian_plan
  for each row
  execute function public.set_updated_at();

alter table public.guardian_plan enable row level security;

drop policy if exists "guardian_plan_select_linked" on public.guardian_plan;
create policy "guardian_plan_select_linked" on public.guardian_plan
  for select using (auth.uid() = guardian_id or auth.uid() = student_id);

-- ไม่มี insert/update policy ให้ client — เขียนผ่าน guardian_* RPC เท่านั้น (ต้อง verify
-- ว่า guardian_id นี้ลิงก์กับ student_id นี้จริงผ่าน guardian_links status='claimed')

comment on table public.guardian_plan is
  'แผนฝึกของนักเรียน 1 คน ตั้งโดยผู้ปกครองที่ลิงก์แล้ว (ผ่าน guardian_links.status=claimed เท่านั้น).';

create table if not exists public.guardian_goal (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.guardian_plan(id) on delete cascade,
  subject text not null check (subject in ('math', 'science')),
  category text not null check (btrim(category) <> ''),
  target_weekly_count integer not null default 0 check (target_weekly_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_goal_plan_subject_category_unique unique (plan_id, subject, category)
);

create index if not exists guardian_goal_plan_idx
  on public.guardian_goal (plan_id);

drop trigger if exists trg_guardian_goal_set_updated_at on public.guardian_goal;
create trigger trg_guardian_goal_set_updated_at
  before update on public.guardian_goal
  for each row
  execute function public.set_updated_at();

alter table public.guardian_goal enable row level security;

drop policy if exists "guardian_goal_select_linked" on public.guardian_goal;
create policy "guardian_goal_select_linked" on public.guardian_goal
  for select using (
    exists (
      select 1 from public.guardian_plan p
      where p.id = guardian_goal.plan_id
        and (p.guardian_id = auth.uid() or p.student_id = auth.uid())
    )
  );

-- ไม่มี insert/update policy ให้ client — เขียนผ่าน guardian_* RPC เท่านั้น

comment on column public.guardian_goal.category is
  'ค่าอิสระตรงกับ public.questions.category (ไม่มี FK เพราะ category ไม่มี registry table แยก '
  'เหมือนกับที่ missions.category ใช้อยู่แล้ว) — validate ฝั่ง RPC ว่ามีคำถาม active ตรง subject+category จริง.';

comment on table public.guardian_goal is
  'เป้าหมายย่อยในแผน อ้างอิง subject+category (หน่วยเดียวกับ mission ไม่ใช่ chapter).';

-- ============================================================
-- 4) guardian_admin — feature allowlist ระหว่าง rollout (แบบเดียวกับ pvp_allowlist/raid_allowlist)
--    กัน 2 ชั้นเสมอ: RPC เช็คทุกตัว (ด้านล่าง) + UI ต้องเช็คด้วยตอน build หน้า /guardian
--    (ยังไม่ทำในไฟล์นี้ — เป็นงาน step ถัดไปตอน build หน้า)
-- ============================================================
create table if not exists public.guardian_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);

alter table public.guardian_admin enable row level security;

drop policy if exists "guardian_admin_select_own" on public.guardian_admin;
create policy "guardian_admin_select_own" on public.guardian_admin
  for select using (auth.uid() = user_id);

comment on table public.guardian_admin is
  'Allowlist เปิดใช้ feature Guardian ระหว่าง rollout (แบบเดียวกับ pvp_allowlist/raid_allowlist) — '
  'ทุก guardian RPC ต้องเช็คตารางนี้ (RPC layer) และ UI ต้องเช็คซ้ำอีกชั้นก่อน render entry point.';

-- ============================================================
-- 5) push_preferences.guardian_enabled — ตั้งต้นเปิด
-- ============================================================
alter table public.push_preferences
  add column if not exists guardian_enabled boolean not null default true;

comment on column public.push_preferences.guardian_enabled is
  'เปิด/ปิดการแจ้งเตือนที่เกี่ยวกับ guardian (เช่น สรุปความคืบหน้าให้ผู้ปกครอง) ตั้งต้นเปิด.';

-- ============================================================
-- 6) handle_new_user() — early return สำหรับ guardian signup
--    guardian signup ส่ง raw_user_meta_data->>'account_type' = 'guardian' มาตอน signUp()
--
--    precondition: เทียบ prosrc (function body ดิบ ไม่ผ่าน pg_get_functiondef ที่อาจ reformat
--    header) กับข้อความที่ verify ตรงกับ production จริงแบบ byte-for-byte แล้ว (ดึงผ่าน
--    Supabase MCP execute_sql บน project wmndxiuqzrnqbhrznmfg ก่อน apply migration นี้ — ตรงกับ
--    20260823000003_privacy_accepted_at.sql เป๊ะ) — เทียบ "เท่ากันเป๊ะ" ไม่ใช่แค่ LIKE substring
--    กันเคส prod มี handle_new_user() เวอร์ชันที่ยังไม่ sync เข้า repo (schema drift) หลุดผ่านแบบ
--    silent (บทเรียนจากเหตุการณ์ precondition หลวมจนเผลอขยาย RLS บน prod ไปแล้วครั้งหนึ่ง)
-- ============================================================
do $$
declare
  v_prosrc text;
  v_expected text := $expected$
begin
  insert into public.profiles (id, username, phone, school, grade_level, privacy_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'school', ''),
    nullif(new.raw_user_meta_data ->> 'grade_level', ''),
    (new.raw_user_meta_data ->> 'privacy_accepted_at')::timestamptz
  );

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  insert into public.push_preferences (user_id)
  values (new.id);

  return new;
end;
$expected$;
begin
  select p.prosrc into v_prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_new_user';

  if v_prosrc is null then
    raise exception 'guardian schema phase0 precondition failed: handle_new_user() not found';
  end if;

  if btrim(v_prosrc) <> btrim(v_expected) then
    raise exception
      'guardian schema phase0 precondition failed: handle_new_user() body ไม่ตรงกับเวอร์ชัน '
      '20260823000003 แบบ byte-for-byte — อาจมี drift ที่ยังไม่ sync เข้า repo ต้องดึง prosrc จริง '
      'มาเช็คก่อน replace ห้าม apply migration นี้จนกว่าจะแก้ precondition ให้ตรง';
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- guardian signup: ไม่มี profiles/player_eggs/push_preferences (ของนักเรียนเท่านั้น) —
  -- แค่สร้าง guardians row แล้ว return ทันที
  if new.raw_user_meta_data ->> 'account_type' = 'guardian' then
    insert into public.guardians (id, display_name, phone)
    values (
      new.id,
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'phone', '')
    );
    return new;
  end if;

  insert into public.profiles (id, username, phone, school, grade_level, privacy_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'school', ''),
    nullif(new.raw_user_meta_data ->> 'grade_level', ''),
    (new.raw_user_meta_data ->> 'privacy_accepted_at')::timestamptz
  );

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  insert into public.push_preferences (user_id)
  values (new.id);

  return new;
end;
$$;

-- ============================================================
-- 7) helper: is_guardian_admin — reuse ในทุก guardian RPC (กัน 2 ชั้น: ชั้นนี้คือ RPC layer)
-- ============================================================
create or replace function public.is_guardian_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.guardian_admin where user_id = p_user_id);
$$;

-- ============================================================
-- 8) RPC ชุด guardian_get_* / guardian_claim_* / guardian_upsert_*
-- ============================================================

-- นักเรียนสร้างรหัสเชิญใหม่ (invalidate รหัส pending เดิมของ student คนนี้ก่อนเสมอ กันมีหลายรหัส
-- ใช้งานพร้อมกันจนสับสน) — ยังคงเช็ค allowlist เหมือนกัน (ทั้งสองฝั่งของ feature อยู่ระหว่าง rollout)
create or replace function public.guardian_create_invite_code()
returns table (invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  update public.guardian_links
  set status = 'revoked'
  where student_id = v_uid and status = 'pending';

  loop
    v_code := (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (floor(random() * 32) + 1)::int, 1), '')
      from generate_series(1, 8)
    );
    exit when not exists (
      select 1 from public.guardian_links gl where gl.invite_code = v_code and gl.status = 'pending'
    );
  end loop;

  v_expires := now() + interval '24 hours';

  insert into public.guardian_links (student_id, invite_code, expires_at)
  values (v_uid, v_code, v_expires);

  return query select v_code, v_expires;
end;
$$;

-- ผู้ปกครองกรอกรหัสเพื่อ claim ลิงก์
create or replace function public.guardian_claim_invite_code(p_invite_code text)
returns table (student_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.guardian_links;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (select 1 from public.guardians where id = v_uid) then
    raise exception 'บัญชีนี้ไม่ใช่บัญชีผู้ปกครอง';
  end if;

  select * into v_link
  from public.guardian_links
  where invite_code = upper(btrim(p_invite_code))
    and status = 'pending'
  for update;

  if not found then
    raise exception 'รหัสเชิญไม่ถูกต้องหรือถูกใช้ไปแล้ว';
  end if;

  if v_link.expires_at < now() then
    update public.guardian_links set status = 'expired' where id = v_link.id;
    raise exception 'รหัสเชิญหมดอายุแล้ว';
  end if;

  update public.guardian_links
  set status = 'claimed', guardian_id = v_uid, claimed_at = now()
  where id = v_link.id;

  return query select v_link.student_id;
end;
$$;

-- รายชื่อนักเรียนที่ลิงก์กับผู้ปกครองคนนี้แล้ว
create or replace function public.guardian_get_students()
returns table (student_id uuid, username text, grade_level text, linked_at timestamptz)
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

  return query
  select p.id, p.username, p.grade_level, gl.claimed_at
  from public.guardian_links gl
  join public.profiles p on p.id = gl.student_id
  where gl.guardian_id = v_uid and gl.status = 'claimed'
  order by gl.claimed_at desc;
end;
$$;

-- แผน + เป้าหมาย ของนักเรียนคนหนึ่ง (ต้องเป็นผู้ปกครองที่ลิงก์แล้ว หรือเป็นตัวนักเรียนเอง)
create or replace function public.guardian_get_plan(p_student_id uuid)
returns table (
  plan_id uuid,
  title text,
  is_active boolean,
  goal_id uuid,
  subject text,
  category text,
  target_weekly_count integer
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

  if v_uid <> p_student_id and not exists (
    select 1 from public.guardian_links
    where guardian_id = v_uid and student_id = p_student_id and status = 'claimed'
  ) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงแผนของนักเรียนคนนี้';
  end if;

  return query
  select gp.id, gp.title, gp.is_active, gg.id, gg.subject, gg.category, gg.target_weekly_count
  from public.guardian_plan gp
  left join public.guardian_goal gg on gg.plan_id = gp.id
  where gp.student_id = p_student_id and gp.is_active
  order by gp.created_at desc, gg.subject, gg.category;
end;
$$;

-- ผู้ปกครองสร้าง/แก้แผนของนักเรียนที่ลิงก์แล้ว (upsert plan แบบ 1 active plan ต่อ student)
create or replace function public.guardian_upsert_plan(p_student_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id uuid;
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
    raise exception 'ไม่มีสิทธิ์แก้ไขแผนของนักเรียนคนนี้';
  end if;

  select id into v_plan_id
  from public.guardian_plan
  where guardian_id = v_uid and student_id = p_student_id and is_active;

  if v_plan_id is null then
    insert into public.guardian_plan (guardian_id, student_id, title)
    values (v_uid, p_student_id, p_title)
    returning id into v_plan_id;
  else
    update public.guardian_plan set title = p_title where id = v_plan_id;
  end if;

  return v_plan_id;
end;
$$;

-- ผู้ปกครองตั้ง/แก้เป้าหมายย่อยในแผน (upsert ตาม subject+category)
create or replace function public.guardian_upsert_goal(
  p_plan_id uuid,
  p_subject text,
  p_category text,
  p_target_weekly_count integer
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_goal_id uuid;
begin
  if v_uid is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  if not public.is_guardian_admin(v_uid) then
    raise exception 'ยังไม่เปิดใช้ฟีเจอร์นี้สำหรับบัญชีนี้';
  end if;

  if not exists (
    select 1 from public.guardian_plan where id = p_plan_id and guardian_id = v_uid
  ) then
    raise exception 'ไม่มีสิทธิ์แก้ไขแผนนี้';
  end if;

  if not exists (
    select 1 from public.questions
    where status = 'active' and subject = p_subject and category = p_category
  ) then
    raise exception 'ไม่พบคำถาม active ของ subject/category นี้';
  end if;

  insert into public.guardian_goal (plan_id, subject, category, target_weekly_count)
  values (p_plan_id, p_subject, p_category, p_target_weekly_count)
  on conflict (plan_id, subject, category)
  do update set target_weekly_count = excluded.target_weekly_count
  returning id into v_goal_id;

  return v_goal_id;
end;
$$;

commit;
