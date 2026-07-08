-- ============================================================
-- Migration: ระบบสัตว์เลี้ยงหลายตัว (pets) + ตารางชนิดไข่ (egg_types)
-- แก้ปัญหา: player_progress ใช้ user_id เป็น PK = เลี้ยงได้ตัวเดียวตลอดชีพ
-- ============================================================

-- ------------------------------------------------------------
-- 1) ตารางชนิดไข่ (reference table — เพิ่มไข่ใหม่ได้แค่ insert แถวใหม่
--    ไม่ต้องแก้ schema ตามหลักการ "ออกแบบให้ขยายได้")
-- ------------------------------------------------------------
create table if not exists public.egg_types (
  id            text primary key,           -- เช่น 'egg_fire_common'
  name_th       text not null,              -- ชื่อแสดงผล เช่น 'ไข่ไฟ'
  tier          text not null check (tier in ('common','rare','epic','legendary')),
  description   text,
  is_obtainable boolean not null default true,  -- ปิดได้ถ้าไข่หมดอายุ event
  created_at    timestamptz not null default now()
);

comment on table public.egg_types is 'ชนิดไข่ทั้งหมดในเกม แยกตาม tier ความหายาก';

-- seed ไข่เริ่มต้น 1 ชนิดสำหรับ MVP (เพิ่มชนิดอื่นทีหลังได้เลยด้วย insert)
insert into public.egg_types (id, name_th, tier, description)
values ('egg_common_01', 'ไข่มาตรฐาน', 'common', 'ไข่เริ่มต้นสำหรับผู้เล่นใหม่')
on conflict (id) do nothing;

alter table public.egg_types enable row level security;

create policy "Anyone can view egg types"
  on public.egg_types for select
  using (true);


-- ------------------------------------------------------------
-- 2) ตาราง pets — 1 แถว = 1 ตัว ผู้เล่นมีได้หลายแถว (หลายตัว)
-- ------------------------------------------------------------
create table if not exists public.pets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  egg_type_id    text not null references public.egg_types(id),

  nickname       text,                       -- ชื่อที่ผู้เล่นตั้งเอง (optional)

  stage          smallint not null default 1 check (stage between 1 and 5),
  exp            integer not null default 0 check (exp >= 0),

  -- สะสมเฉพาะของ "ตัวนี้" ใช้คำนวณ subline ตอนระยะ 3 (เกณฑ์ >=60%)
  math_correct    integer not null default 0 check (math_correct >= 0),
  science_correct integer not null default 0 check (science_correct >= 0),

  -- ล็อกค่าตอนวิวัฒนาการถึงระยะที่เกี่ยวข้อง ก่อนหน้านั้นเป็น null
  subline        text check (subline in ('math','science','balanced')),
  personality    text check (personality in ('A','B')),

  -- true = ตัวที่กำลังเลี้ยงอยู่ตอนนี้ (รับ EXP จากการตอบคำถาม)
  -- false = จบรอบแล้ว เก็บเข้าสมุดสะสม (หรือส่งผจญภัยในอนาคต)
  is_active      boolean not null default true,

  -- สเตตัสสำหรับระบบสู้/ดันในอนาคต (ดู design doc หมวด 5)
  best_combo     smallint not null default 0,  -- คอมโบสูงสุดที่เคยทำ (ใช้คำนวณ SPD) track ระหว่างเล่น
  stat_hp        integer,   -- snapshot ตอนถึงระยะ 4 (null ก่อนหน้านั้น)
  stat_atk       integer,
  stat_def       integer,
  stat_spd       integer,
  stat_foc       integer,

  hatched_at     timestamptz not null default now(),  -- เวลาเริ่มฟักไข่ตัวนี้
  evolved_at     timestamptz,                          -- เวลาวิวัฒนาการล่าสุด
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.pets is 'สัตว์เลี้ยงของผู้เล่น 1 คนมีได้หลายตัว';
comment on column public.pets.is_active is 'มีได้สูงสุด 1 ตัว/user ที่เป็น true ในเวลาเดียวกัน (ตัวที่กำลังเลี้ยง)';

-- บังคับว่า 1 user มีสัตว์ "กำลังเลี้ยง" ได้ตัวเดียวในเวลาเดียวกัน
create unique index if not exists pets_one_active_per_user
  on public.pets (user_id)
  where is_active;

-- index ช่วย query หน้า "สมุดสะสม" และ "รายชื่อสัตว์ของฉัน"
create index if not exists pets_user_id_idx on public.pets (user_id);
create index if not exists pets_user_egg_type_idx on public.pets (user_id, egg_type_id);

-- อัปเดต updated_at อัตโนมัติทุกครั้งที่แก้แถว
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pets_set_updated_at on public.pets;
create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function public.set_updated_at();

alter table public.pets enable row level security;

create policy "Users can view own pets"
  on public.pets for select
  using (auth.uid() = user_id);

create policy "Users can insert own pets"
  on public.pets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own pets"
  on public.pets for update
  using (auth.uid() = user_id);

-- ตั้งใจไม่มี delete policy: สัตว์ไม่ควรลบได้เอง
-- (ตรงกับหลักการ "ไม่ลงโทษถาวร" ในดีไซน์ดอค ข้อ 1)


-- ------------------------------------------------------------
-- 3) เชื่อม quiz_attempts เข้ากับสัตว์ตัวที่กำลังเลี้ยง
--    (ปลอดภัย ไม่กระทบคอลัมน์เดิม เพราะเป็นแค่เพิ่มคอลัมน์ nullable)
-- ------------------------------------------------------------
alter table public.quiz_attempts
  add column if not exists pet_id uuid references public.pets(id);

create index if not exists quiz_attempts_pet_id_idx on public.quiz_attempts (pet_id);


-- ------------------------------------------------------------
-- 4) TODO: ส่วนที่ยังทำไม่ได้ — เกี่ยวกับตาราง player_progress เดิม
-- ------------------------------------------------------------
-- ยังไม่รู้ว่า player_progress มีคอลัมน์อะไรบ้างตอนนี้ (exp, coins, streak ฯลฯ)
-- และมีข้อมูลจริงอยู่หรือยัง จึงยังเขียนส่วนนี้ให้แม่นยำไม่ได้:
--
--   - ถ้า player_progress เก็บ "แค่สถานะสัตว์ตัวเดียว" ทั้งหมด
--     -> ย้ายไปอยู่ใน pets แล้ว ตารางนี้อาจ DROP ทิ้งได้เลย
--   - ถ้ามีข้อมูลระดับบัญชีด้วย (เหรียญ, streak เข้าเล่น, สถิติรวม)
--     -> ควรเก็บตารางไว้ แต่ตัดคอลัมน์ที่ย้ายไป pets ออก
--
-- ส่งโครงสร้างคอลัมน์ปัจจุบันของ player_progress มาให้ดูก่อน
-- แล้วจะเขียน ALTER/DROP ที่แม่นยำต่อให้ครับ
