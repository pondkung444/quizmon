-- ============================================================
-- Schema สำหรับ "เกมเลี้ยงสัตว์ + ตอบคำถามเตรียมสอบ ม.4"
-- วิธีใช้: เปิด Supabase Dashboard > SQL Editor > วางไฟล์นี้ทั้งหมด > Run
--
-- หมายเหตุ (2026-07-08): ไฟล์นี้ sync กับ DB จริงหลัง migration 002-009
-- (supabase/migrations/*.sql) egg_types/pets/player_eggs/quiz_attempts
-- ยืนยันคอลัมน์ครบจาก DB จริงแล้วทั้งหมด
-- ============================================================

-- 1) โปรไฟล์ผู้ใช้ (เสริมจาก auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

-- 2) ชนิดไข่ (คลังต้นแบบ) — ยืนยันจาก DB จริงทุกคอลัมน์ (stat_profile เพิ่มโดย
--    migration 004_egg_stat_profiles.sql, sprite_prefix เพิ่มโดย
--    migration 009_egg_sprite_prefix.sql ที่เหลือเป็น base table)
create table if not exists public.egg_types (
  id text primary key,
  name_th text not null,
  tier text not null,
  description text,
  is_obtainable boolean not null default true,
  created_at timestamptz not null default now(),
  stat_profile jsonb,
  sprite_prefix text not null
);

comment on column public.egg_types.stat_profile is
  'ลายเซ็นสเตตัสของไข่: growth curve (base_offset/rate_multiplier) + per-stat caps. ผลรวม caps ของไข่ common ทุกใบต้องเท่ากัน';
comment on column public.egg_types.sprite_prefix is
  'ใช้ประกอบ path รูป เช่น public/pets/{sprite_prefix}_stage{N}_....png';

-- 3) สัตว์เลี้ยงของผู้เล่น: 1 user มีได้หลายตัว (สมุด/คลัง) แต่ active ทีละตัวผ่าน is_active
--    (แทนที่ player_progress เดิม ซึ่งถูก drop ไปแล้ว — คอลัมน์ exp_today/exp_today_date
--    ที่เคยอยู่บน player_progress ย้ายมาอยู่ต่อแถวสัตว์แต่ละตัวแทน)
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  egg_type_id text references public.egg_types (id),
  nickname text,
  stage smallint not null default 1,
  exp integer not null default 0,
  math_correct integer not null default 0,
  science_correct integer not null default 0,
  subline text, -- lock ครั้งเดียวตอนขยับเข้า stage 3 (ดู src/lib/evolution.ts)
  personality text, -- lock ครั้งเดียวตอนขยับเข้า stage 4
  is_active boolean not null default true,
  best_combo smallint not null default 0,
  stat_hp integer,
  stat_atk integer,
  stat_def integer,
  stat_spd integer,
  stat_foc integer,
  hatched_at timestamptz,
  evolved_at timestamptz, -- ตั้งค่าตอนขยับเข้า stage 4 (snapshot stat เสร็จ)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  exp_today integer not null default 0,
  exp_today_date date not null default current_date
);

comment on column public.pets.best_combo is
  'คอมโบสูงสุดที่เคยทำได้ของตัวนี้ (runtime, อัปเดตระหว่างเล่น) — ใช้คำนวณ SPD ตอน snapshot';
comment on column public.pets.stat_hp is
  'HP snapshot ตอนถึงระยะ 4 — มาจากความสม่ำเสมอ (จำนวนวันที่เข้าเล่นของตัวนี้)';
comment on column public.pets.stat_atk is
  'ATK snapshot ตอนถึงระยะ 4 — มาจากจำนวนข้อที่ตอบถูกสะสมของตัวนี้';
comment on column public.pets.stat_def is
  'DEF snapshot ตอนถึงระยะ 4 — มาจากความกว้าง (ทำทั้งคณิต+วิทย์ ไม่ทิ้งวิชา)';
comment on column public.pets.stat_spd is
  'SPD snapshot ตอนถึงระยะ 4 — มาจาก best_combo';
comment on column public.pets.stat_foc is
  'FOC snapshot ตอนถึงระยะ 4 — มาจากความแม่นยำเฉลี่ยของตัวนี้';
comment on column public.pets.exp_today is
  'EXP ที่ตัวนี้ได้รับวันนี้ (นับเทียบ soft cap 180/วัน) — โค้ดต้องรีเซ็ตเป็น 0 เมื่อ exp_today_date ไม่ใช่วันนี้';
comment on column public.pets.exp_today_date is
  'วันที่ล่าสุดที่นับ exp_today ไว้ ใช้เทียบกับ current_date เพื่อรู้ว่าต้องรีเซ็ตยอดวันใหม่หรือยัง';

create index if not exists pets_user_id_idx on public.pets (user_id);
create unique index if not exists pets_one_active_per_user_idx on public.pets (user_id) where is_active;

-- 4) คลังไข่ราย user รองรับไข่ที่ได้จากหลายแหล่ง (starter / รางวัล / idle / ดันเจี้ยน / leaderboard)
--    ได้ไข่มา = insert 1 แถว (hatched_at = null -> อยู่ในคลัง)
--    ฟักไข่   = set hatched_at = now(), hatched_pet_id = <pet ที่สร้าง> + สร้างแถวใน pets
--    คลังปัจจุบัน = แถวที่ hatched_at is null
--    หลักที่คงไว้: เลี้ยงทีละตัว (pets.is_active unique ต่อ user) แต่ถือไข่รอในคลังได้หลายใบ
create table if not exists public.player_eggs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  egg_type_id    text not null references public.egg_types(id),
  source         text not null,
  obtained_at    timestamptz not null default now(),
  hatched_at     timestamptz,                                   -- null = ยังอยู่ในคลัง
  hatched_pet_id uuid references public.pets(id) on delete set null
);

comment on column public.player_eggs.source is
  'ที่มาของไข่ — ค่าที่ใช้ตอนนี้: starter (ไข่ใบแรกตอนสมัคร), first_pet_reward (ปลดหลังเก็บสัตว์ตัวแรก). สงวนไว้อนาคต: idle, dungeon, leaderboard, event. ใช้ text ตั้งใจ (เพิ่ม source ใหม่ไม่ต้อง ALTER)';
comment on column public.player_eggs.hatched_at is
  'null = ไข่ยังอยู่ในคลังรอฟัก / มีค่า = ฟักไปแล้ว (ดูตัวที่ฟักได้จาก hatched_pet_id)';

-- index: ดึง "คลังปัจจุบัน" ของ user (ไข่ที่ยังไม่ฟัก) ให้เร็ว
create index if not exists idx_player_eggs_unhatched
  on public.player_eggs (user_id)
  where hatched_at is null;

-- 5) ตารางเสริม: ประวัติการตอบคำถามทีละข้อ (ถูก/ผิด) — ใช้ทำสถิติ/กันตอบซ้ำในอนาคต
create table if not exists public.quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete set null,
  question_id text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

comment on column public.quiz_attempts.pet_id is
  'สัตว์ที่ active ตอนตอบข้อนี้ — ใช้คำนวณ subline/personality/stat_* ราย pet ตอนวิวัฒนาการ';

create index if not exists quiz_attempts_user_id_idx on public.quiz_attempts (user_id);
-- index สำหรับ query "คำตอบทั้งหมดของ pet ตัวนี้" (ใช้บ่อยตอน snapshot stat)
create index if not exists idx_quiz_attempts_pet_id
  on public.quiz_attempts (pet_id)
  where pet_id is not null;

-- ============================================================
-- Row Level Security: ผู้ใช้เห็น/แก้ได้เฉพาะข้อมูลของตัวเอง
-- ============================================================

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.player_eggs enable row level security;
alter table public.quiz_attempts enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

create policy "pets: select own" on public.pets
  for select using (auth.uid() = user_id);

create policy "pets: update own" on public.pets
  for update using (auth.uid() = user_id);

create policy "pets: insert own" on public.pets
  for insert with check (auth.uid() = user_id);

-- ไม่มี delete policy ตั้งใจ (สอดคล้อง pets — หลักข้อ 1 ลบไม่ได้)
create policy "player_eggs_select_own" on public.player_eggs
  for select using (auth.uid() = user_id);
create policy "player_eggs_insert_own" on public.player_eggs
  for insert with check (auth.uid() = user_id);
create policy "player_eggs_update_own" on public.player_eggs
  for update using (auth.uid() = user_id);

create policy "quiz_attempts: select own" on public.quiz_attempts
  for select using (auth.uid() = user_id);

create policy "quiz_attempts: insert own" on public.quiz_attempts
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- Trigger: เมื่อมีผู้ใช้สมัครใหม่ (auth.users) ให้สร้างแถว profiles
-- (เดิม trigger นี้สร้าง player_progress ให้ด้วย — ตอนนี้ตารางนั้นถูกลบแล้ว
-- ตั้งแต่ migration 008_fix_handle_new_user_starter_egg.sql เปลี่ยนมา insert
-- ไข่ starter เข้า player_eggs แทน — ผู้เล่นกดฟักเองจากคลังไข่ ไม่ฟักอัตโนมัติ)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');

  insert into public.player_eggs (user_id, egg_type_id, source)
  values (new.id, 'egg_common_01', 'starter');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Trigger: ให้ pets.updated_at อัปเดตอัตโนมัติทุกครั้งที่มี UPDATE แทนที่จะพึ่งให้
-- โค้ดแอปตั้งค่าเอง (migration 007_pets_auto_updated_at.sql)
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pets_set_updated_at on public.pets;

create trigger trg_pets_set_updated_at
  before update on public.pets
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- คลังคำถามสำหรับหน้าตอบคำถาม (import จากไฟล์ .md ใน /question ด้วย scripts/import-questions.mjs)
-- ============================================================

create table if not exists public.questions (
  id bigint generated always as identity primary key,
  subject text not null,
  category text not null,
  difficulty smallint not null default 1,
  question_text text not null,
  choices jsonb not null,
  correct_index smallint not null,
  explanation text,
  created_at timestamptz not null default now()
);

-- ล็อก RLS ไว้โดยไม่มี select policy ใดๆ: อ่านได้เฉพาะฝั่ง server ผ่าน service role
-- (กันไม่ให้ client ยิง REST API ตรงไปเห็น correct_index/explanation ก่อนตอบ)
alter table public.questions enable row level security;

-- ระบบ EXP รายวัน: จำกัด exp ที่เข้าตัวสัตว์วันละ 180 ต่อสัตว์ที่ active อยู่
-- (ดูตรรกะที่ src/app/quiz/actions.ts — exp_today/exp_today_date อยู่บน pets โดยตรงแล้ว)
