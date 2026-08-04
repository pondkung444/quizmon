-- Migration: 20260804120200_dungeon_schema
-- Phase 3 (ระบบผจญภัย/idle dungeon): schema หลังบ้าน — ยังไม่แตะ UI
-- ผู้เล่นส่ง Qmon stage 4 ที่เก็บเข้าสมุดแล้ว (is_active=false) ไปเดินทาง N ชม. ได้อาหารการันตี 1
-- ชิ้น + โอกาสได้ไข่ตาม reward_tier ของดันเจี้ยน + คำถามโบนัส 5 ข้อร่นเวลาได้ (ไม่ให้ EXP)
--
-- ออกแบบเผื่อ N ดันเจี้ยนในอนาคต (v1 มีแค่ 1 แถวใน dungeon_types, reward_tier='rare')

-- ============================================================
-- 1) dungeon_types — public read, เขียนได้เฉพาะ migration/admin
-- ============================================================
create table public.dungeon_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_th text not null,
  description_th text,
  background_path text not null,
  duration_minutes int not null default 480,
  reward_tier text not null,        -- 'rare' ตอนนี้ · เผื่อ 'epic' อนาคต
  sort_order int not null default 0,
  is_active boolean not null default true
);

comment on table public.dungeon_types is 'ชนิดดันเจี้ยนผจญภัยทั้งหมด (v1 มี 1 แถว) — public read เหมือน egg_types';

alter table public.dungeon_types enable row level security;

create policy "Anyone can view dungeon types" on public.dungeon_types
  for select using (true);

-- ============================================================
-- 2) dungeon_runs — 1 แถว = การผจญภัย 1 ครั้งของ user 1 คน
-- ============================================================
create table public.dungeon_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id),
  dungeon_type_id uuid not null references public.dungeon_types(id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  claimed_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','claimed')),
  egg_awarded boolean not null default false,
  egg_type_id text references public.egg_types(id),
  food_kind text check (food_kind is null or food_kind in ('A','B')),
  bonus_quiz_used boolean not null default false,
  bonus_minutes_saved int not null default 0
);

comment on table public.dungeon_runs is 'ประวัติการผจญภัยของผู้เล่น — เขียนได้เฉพาะผ่าน RPC (start_dungeon_run/claim_dungeon_run/apply_dungeon_bonus) เท่านั้น ไม่มี insert/update policy ให้ client ตรง';

alter table public.dungeon_runs enable row level security;

create policy "dungeon_runs: select own" on public.dungeon_runs
  for select using (auth.uid() = user_id);

-- ตั้งใจไม่มี insert/update/delete policy: ทุก write ต้องผ่าน RPC security definer เท่านั้น
-- (กันเคลมรางวัล/ร่นเวลาแบบ read-modify-write จากฝั่งแอปตรงๆ ซึ่งเสี่ยง race condition)

-- กันมีรัน in_progress เกิน 1 ต่อ user (เลียนแบบ pets_one_active_per_user)
create unique index dungeon_runs_one_active_per_user
  on public.dungeon_runs (user_id) where status = 'in_progress';

create index idx_dungeon_runs_user on public.dungeon_runs (user_id);

-- ============================================================
-- 3) dungeon_pity — มิเตอร์การันตีไข่ต่อ user ต่อ reward_tier
-- ============================================================
create table public.dungeon_pity (
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_tier text not null,
  meter int not null default 0,
  primary key (user_id, reward_tier)
);

comment on table public.dungeon_pity is 'มิเตอร์การันตีไข่สะสมของผู้เล่น แยกตาม reward_tier — เขียนได้เฉพาะผ่าน claim_dungeon_run() (security definer) เท่านั้น';

alter table public.dungeon_pity enable row level security;

create policy "dungeon_pity: select own" on public.dungeon_pity
  for select using (auth.uid() = user_id);

-- ============================================================
-- 4) Seed v1: ถ้ำเยือกขาว (rare)
-- ============================================================
insert into public.dungeon_types (slug, name_th, background_path, duration_minutes, reward_tier, sort_order, is_active)
values ('cave_frost', 'ถ้ำเยือกขาว', '/dungeons/cave_frost.webp', 480, 'rare', 1, true);

-- ============================================================
-- Rollback (รันตามลำดับนี้ถ้าต้องย้อนกลับ):
-- ============================================================
-- drop table if exists public.dungeon_pity;
-- drop index if exists public.idx_dungeon_runs_user;
-- drop index if exists public.dungeon_runs_one_active_per_user;
-- drop table if exists public.dungeon_runs;
-- drop table if exists public.dungeon_types;
