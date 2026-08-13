-- Achievement System — Phase B: schema
-- ตาม quizmon-achievement-system-design.md §5 (61 เหรียญ, ล็อกแล้ว)

create table public.achievement_definitions (
  id text primary key,
  category text not null,
  name text not null,
  condition_text text not null,
  tier text not null check (tier in ('Bronze','Silver','Gold','Crown')),
  image_file text not null,
  sort_order integer not null
);
comment on table public.achievement_definitions is 'Registry เหรียญ Achievement ทั้ง 61 รายการ — import จาก public/achievement/achievement-manifest-v9.csv, เป็น source of truth สำหรับชื่อ/เงื่อนไข/ระดับ/ไฟล์ภาพที่ UI และ RPC ใช้ join';

create table public.user_achievements (
  user_id uuid not null references auth.users(id),
  achievement_id text not null references public.achievement_definitions(id),
  earned_at timestamptz not null default now(),
  pet_id uuid references public.pets(id),
  pet_name_snapshot text,
  celebrated_at timestamptz,
  primary key (user_id, achievement_id)
);
comment on table public.user_achievements is 'Ledger การปลดล็อก Achievement จริงของผู้เล่น — เขียนได้เฉพาะผ่าน RPC evaluate_achievements() (security definer) เท่านั้น. celebrated_at ใช้กันหน้าฉลองซ้ำ (แสดงครั้งเดียวตามกติกาเฟส 1)';

create table public.user_pinned_achievements (
  user_id uuid not null references auth.users(id),
  achievement_id text not null references public.achievement_definitions(id),
  pin_order smallint not null check (pin_order between 1 and 3),
  primary key (user_id, pin_order)
);
comment on table public.user_pinned_achievements is 'เหรียญที่ผู้เล่นปักไว้บนหน้าโปรไฟล์ สูงสุด 3 เหรียญ';

create table public.achievement_tester_eligibility (
  user_id uuid primary key references auth.users(id),
  eligible boolean not null default true,
  note text
);
comment on table public.achievement_tester_eligibility is 'Snapshot รายชื่อ Tester ที่มีสิทธิ์รับ legacy_pioneer_tester (Crown) — ว่างเปล่าจนกว่าปอนด์ยืนยันวันตัดยอด/รายชื่อ (เฟส H แยกทำทีหลัง ไม่บล็อกเฟสอื่น)';

alter table public.achievement_definitions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_pinned_achievements enable row level security;
alter table public.achievement_tester_eligibility enable row level security;

-- achievement_definitions: public read (เหมือน egg_types/raid_types)
create policy "achievement_definitions_select_all" on public.achievement_definitions
  for select using (true);

-- user_achievements: ผู้เล่นอ่านของตัวเองได้, เขียนผ่าน RPC (security definer) เท่านั้น ไม่มี insert/update/delete policy ให้ client
create policy "user_achievements_select_own" on public.user_achievements
  for select using (auth.uid() = user_id);

-- user_pinned_achievements: ผู้เล่นอ่าน/แก้ของตัวเองได้ตรงๆ (ไม่ใช่ progression, แค่ preference)
create policy "user_pinned_achievements_select_own" on public.user_pinned_achievements
  for select using (auth.uid() = user_id);
create policy "user_pinned_achievements_insert_own" on public.user_pinned_achievements
  for insert with check (auth.uid() = user_id);
create policy "user_pinned_achievements_update_own" on public.user_pinned_achievements
  for update using (auth.uid() = user_id);
create policy "user_pinned_achievements_delete_own" on public.user_pinned_achievements
  for delete using (auth.uid() = user_id);

-- achievement_tester_eligibility: ผู้เล่นอ่านของตัวเองได้เท่านั้น (ไว้เช็คว่าตัวเองมีสิทธิ์ไหมสำหรับ UI ซ่อน/แสดงเหรียญลับ)
create policy "achievement_tester_eligibility_select_own" on public.achievement_tester_eligibility
  for select using (auth.uid() = user_id);
