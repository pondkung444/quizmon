-- Migration: 005_player_eggs.sql
-- วัตถุประสงค์: สร้าง "คลังไข่" ราย user รองรับไข่ที่ได้จากหลายแหล่ง (starter / รางวัล / idle / ดันเจี้ยน / leaderboard)
-- อ้างอิง: การตัดสินใจ design — ให้ผู้เล่นเลือกฟักไข่ใบไหนต่อได้ + รองรับไข่หลายชนิดในอนาคต
--
-- โมเดล:
--   ได้ไข่มา  = insert 1 แถวใน player_eggs (hatched_at = null -> อยู่ในคลัง)
--   ฟักไข่    = set hatched_at = now(), hatched_pet_id = <pet ที่สร้าง> + สร้างแถวใน pets
--   คลังปัจจุบัน = แถวที่ hatched_at is null
--
-- หลักที่คงไว้: เลี้ยงทีละตัว (pets.is_active unique ต่อ user) แต่ถือไข่รอในคลังได้หลายใบ

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

-- RLS: ดู/แก้เฉพาะเจ้าของ, ไม่มี delete policy (สอดคล้อง pets — หลักข้อ 1 ลบไม่ได้)
alter table public.player_eggs enable row level security;

create policy "player_eggs_select_own" on public.player_eggs
  for select using (auth.uid() = user_id);
create policy "player_eggs_insert_own" on public.player_eggs
  for insert with check (auth.uid() = user_id);
create policy "player_eggs_update_own" on public.player_eggs
  for update using (auth.uid() = user_id);
