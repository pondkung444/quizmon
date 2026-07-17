-- Migration: 021_daily_missions.sql
-- วัตถุประสงค์: ระบบภารกิจประจำวัน — เลือกบทที่เหมาะกับผู้เล่นแต่ละคนจากผล 7/14 วันล่าสุด
-- สร้างภารกิจ 5 ข้อ/วัน + โบนัสจบภารกิจ +10 EXP คงที่ (ไม่ใช่แหล่ง EXP ใหม่ต่อข้อ — EXP ต่อข้อ
-- ยังไหลผ่าน submitAnswer()/apply_quiz_answer_pet_update() เดิมทุกอย่าง ดู migration 020)
--
-- หมายเหตุ: exploration (ภารกิจสำรวจ) ล็อกบทเดียวเสมอ ไม่สุ่มทั้งวิชา (มี 11 บท/วิชา สุ่มทั้งวิชา
-- จะกระจายคนละบท ได้ข้อมูลบทละ ~1 ข้อ ไม่มีทางผ่านเกณฑ์ ranking ของบทไหนเลย) — category จึงเป็น
-- not null เสมอทั้ง personalized และ exploration ต่างกันแค่การมี/ไม่มี baseline_accuracy และ
-- ข้อความ frame ฝั่ง UI เท่านั้น

-- ============================================================
-- 1) ตาราง daily_missions — 1 แถว = ภารกิจ 1 วันของ user 1 คน
-- ============================================================
create table public.daily_missions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  mission_date      date not null,
  mission_type      text not null check (mission_type in ('personalized','exploration')),
  subject           text not null,
  category          text not null,       -- ทั้ง personalized และ exploration ล็อกบทเดียวเสมอ
  target_count      smallint not null default 5,
  baseline_accuracy numeric,             -- snapshot % 7 วัน ณ ตอนสร้าง — null เฉพาะ exploration
  bonus_exp         smallint not null default 10,
  bonus_awarded_at  timestamptz,         -- แก้ได้ทางเดียวคือผ่าน RPC claim_daily_mission_bonus()
  created_at        timestamptz not null default now(),
  unique (user_id, mission_date)         -- กัน race ตอน getOrCreateTodayMission(): insert ชน
                                          -- unique -> select แถวเดิมมาใช้แทน
);

comment on table public.daily_missions is 'ภารกิจประจำวันของผู้เล่นแต่ละคน วันละ 1 แถว/user (unique user_id+mission_date)';
comment on column public.daily_missions.category is
  'บทที่เลือกให้ทำภารกิจวันนี้ — not null เสมอ (exploration ก็ล็อกบทเดียว ไม่สุ่มทั้งวิชา)';
comment on column public.daily_missions.baseline_accuracy is
  'accuracy % ของบทนี้ในช่วง 7 วันก่อนสร้างภารกิจ — เฉพาะ personalized เท่านั้น exploration เป็น null เสมอ';
comment on column public.daily_missions.bonus_awarded_at is
  'timestamp ตอนจ่ายโบนัส +10 EXP — null = ยังไม่จ่าย ไม่มี update policy ให้ client แก้ตรง
   แก้ได้ทางเดียวคือ RPC claim_daily_mission_bonus() (security definer) กันผู้เล่นยิง PATCH
   รีเซ็ตค่านี้กลับเป็น null เองแล้วเคลมโบนัสซ้ำ';

alter table public.daily_missions enable row level security;

create policy "daily_missions: select own" on public.daily_missions
  for select using (auth.uid() = user_id);

create policy "daily_missions: insert own" on public.daily_missions
  for insert with check (auth.uid() = user_id);

-- ตั้งใจไม่มี update/delete policy: ไม่มีทางแก้ผ่าน REST ตรงๆ ได้เลยไม่ว่าคอลัมน์ไหน
-- (bonus_awarded_at ต้องผ่าน RPC security definer เท่านั้น ตามคอมเมนต์ข้างบน ส่วนคอลัมน์อื่น
-- ก็ไม่ควรแก้หลังสร้างแล้วอยู่แล้ว — ตรงกับ pattern "ไม่ลงโทษถาวร"/ไม่มี delete policy ของ pets)


-- ============================================================
-- 2) เชื่อม quiz_attempts เข้ากับภารกิจที่กำลังทำ (nullable — โหมดฝึกปกติไม่มีค่านี้)
-- ============================================================
alter table public.quiz_attempts
  add column if not exists mission_id uuid references public.daily_missions(id) on delete set null;

comment on column public.quiz_attempts.mission_id is
  'ภารกิจประจำวันที่ข้อนี้ถูกนับ — null เมื่อตอบในโหมดฝึกปกติ (ไม่ใช่ทุกแถวมีค่านี้)';

-- index รองรับ "นับตอบแล้ว/ถูกกี่ข้อของภารกิจ X" (derive สถานะการ์ดทุกครั้งที่โหลดหน้าหลัก
-- ไม่มี column status เก็บเอง ดู design doc Phase 2 หมวด "สถานะการ์ด")
create index if not exists idx_quiz_attempts_mission_id
  on public.quiz_attempts (mission_id)
  where mission_id is not null;

-- index (user_id, created_at) — survey เฟส 0 ข้อ 7 ยืนยันว่ายังไม่มี (มีแค่ user_id เดี่ยว กับ
-- (pet_id, created_at)) ต้องใช้ query "quiz_attempts ของ user คนนี้ 14 วันล่าสุด" ของ
-- getOrCreateTodayMission()
create index if not exists idx_quiz_attempts_user_created
  on public.quiz_attempts (user_id, created_at);


-- ============================================================
-- 3) RPC: จ่ายโบนัสจบภารกิจแบบ atomic กันจ่ายซ้ำ (double-tap / กดย้อนกลับแล้วกดใหม่)
-- ============================================================
-- security definer (ต่างจาก apply_quiz_answer_pet_update ของ migration 020 ที่เป็น invoker
-- เพราะฝากสิทธิ์ไว้กับ RLS policy "pets: update own" ที่มีอยู่แล้ว) — ที่นี่ต้อง security definer
-- เพราะ daily_missions ไม่มี update policy ให้ authenticated เลยแม้แต่ข้อเดียว (ตั้งใจ ดูคอมเมนต์
-- ข้อ 1) ฟังก์ชันนี้เลยต้องรันด้วยสิทธิ์เจ้าของ (bypass RLS) แต่ตรวจ auth.uid() เองตรงๆ แทน
-- ป้องกัน user อื่นเคลมภารกิจของคนอื่น + set search_path = public กัน search_path hijacking
-- (ตาม pattern เดียวกับ public.handle_new_user() ที่มีอยู่แล้ว)
--
-- ทั้งฟังก์ชันรันเป็น 1 transaction โดย Postgres อยู่แล้ว (เรียกครั้งเดียวจาก client = 1 statement
-- ฝั่ง caller) ถ้าจุดไหนพังกลางทาง ทั้งก้อนจะ rollback หมด รวมถึง mark bonus_awarded_at ด้วย —
-- ไม่มีทางค้างสภาพ "mark แล้วแต่ EXP ไม่เข้า" เลย
--
-- ลำดับตั้งใจ: เช็คมี active pet ก่อนเป็นอย่างแรก (ล็อก id ไว้ใน v_pet_id) แล้วค่อย mark
-- bonus_awarded_at — สลับจากดราฟต์แรกที่ mark ก่อนเช็ค pet (เจอปัญหาตอน review: ถ้าไม่มี active
-- pet ตอนนั้น bonus_awarded_at จะโดน mark ถาวรทั้งที่ EXP ไม่ได้เข้าใคร เคลมซ้ำไม่ได้อีกเลย) เคส
-- นี้เกิดได้จริงถ้าผู้เล่นเก็บสัตว์เข้าสมุด (is_active=false) ระหว่างที่มีภารกิจค้างอยู่ แล้วยังไม่ได้
-- ฟักตัวใหม่ตอนกดจบภารกิจ
create or replace function public.claim_daily_mission_bonus(p_mission_id uuid)
returns table (awarded boolean, bonus_exp smallint, no_active_pet boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pet_id uuid;
  v_bonus_exp smallint;
  v_rows int;
begin
  if v_user_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select id into v_pet_id
  from public.pets
  where user_id = v_user_id and is_active = true
  limit 1;

  if v_pet_id is null then
    -- ไม่มี active pet ตอนนี้ — ไม่แตะ daily_missions เลย (bonus_awarded_at ยังเป็น null)
    -- ให้เคลมใหม่ได้ทีหลังตอนมี pet active แล้ว (ดู getOrCreateTodayMission() เฟส 2)
    return query select false, null::smallint, true;
    return;
  end if;

  -- WHERE bonus_awarded_at is null คือกลไกกันจ่ายซ้ำทั้งหมด: ถ้าเคยจ่ายแล้ว UPDATE นี้จะไม่เจอแถว
  -- (ไม่ว่าจะเรียกซ้อนกันกี่ครั้ง มีแค่ครั้งเดียวที่ชนะ race เพราะ UPDATE ล็อกแถวอัตโนมัติ)
  update public.daily_missions
  set bonus_awarded_at = now()
  where id = p_mission_id
    and user_id = v_user_id
    and bonus_awarded_at is null
  returning daily_missions.bonus_exp into v_bonus_exp;

  if not found then
    -- เคยจ่ายแล้ว (หรือ mission_id ไม่ใช่ของ user นี้/ไม่มีจริง) จบเงียบๆ ไม่ error กัน double-tap
    return query select false, null::smallint, false;
    return;
  end if;

  -- ใช้ v_pet_id ที่ล็อกไว้จาก select ข้างบน ไม่ query where user_id/is_active ใหม่ตรงนี้ —
  -- กันเคสมุมที่ pet เปลี่ยนสถานะ (is_active) ระหว่าง 2 statement นี้พอดี
  --
  -- โบนัสข้ามระบบ daily EXP cap โดยเจตนา: บวก pets.exp ตรง ไม่แตะ exp_today/exp_today_date
  -- (ได้วันละครั้งอยู่แล้วจาก unique(user_id, mission_date) + bonus_awarded_at guard ข้างบน
  -- grind ซ้ำไม่ได้ ไม่จำเป็นต้องนับเข้า cap อีกชั้น)
  update public.pets
  set exp = exp + v_bonus_exp
  where id = v_pet_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- pet ที่ล็อกไว้หายไประหว่างทาง (เช่นโดนเก็บเข้าสมุดพอดีเสี้ยววินาทีนี้) — raise เพื่อ rollback
    -- ทั้ง transaction รวมถึง mark bonus_awarded_at ข้างบนด้วย ปลอดภัยกว่าปล่อยเงียบ: มาร์กหาย
    -- พร้อมกับ EXP ที่ไม่ได้บวก ดีกว่ามาร์กค้างโดยไม่มี EXP เข้าใคร
    raise exception 'claim_daily_mission_bonus: pet % หายไประหว่างเคลมโบนัส (mission %)', v_pet_id, p_mission_id;
  end if;

  return query select true, v_bonus_exp, false;
end;
$$;

grant execute on function public.claim_daily_mission_bonus(uuid) to authenticated;


-- ============================================================
-- Rollback (รันตามลำดับนี้ถ้าต้องย้อนกลับ):
-- ============================================================
-- drop function if exists public.claim_daily_mission_bonus(uuid);
-- alter table public.quiz_attempts drop column if exists mission_id;  -- cascades: ลบ idx_quiz_attempts_mission_id ไปด้วยอัตโนมัติ (index อิงคอลัมน์นี้เท่านั้น)
-- drop index if exists public.idx_quiz_attempts_user_created;
-- drop table if exists public.daily_missions;
