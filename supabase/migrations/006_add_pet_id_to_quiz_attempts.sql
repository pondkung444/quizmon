-- Migration: 006_add_pet_id_to_quiz_attempts.sql
-- วัตถุประสงค์: เพิ่ม pet_id ให้ quiz_attempts (เอกสาร v2 ข้อ 7.1 ตั้งใจให้มีตั้งแต่ 001 แต่ scan โค้ดจริงพบว่าไม่มี)
-- ใช้ผูกว่าคำตอบแต่ละข้อเป็นของสัตว์ตัวไหน -> เอาไปคำนวณ math_correct/science_correct/stat_* ราย pet

alter table public.quiz_attempts
  add column if not exists pet_id uuid references public.pets(id) on delete set null;

comment on column public.quiz_attempts.pet_id is
  'สัตว์ที่ active ตอนตอบข้อนี้ — ใช้คำนวณ subline/personality/stat_* ราย pet ตอนวิวัฒนาการ';

-- index สำหรับ query "คำตอบทั้งหมดของ pet ตัวนี้" (ใช้บ่อยตอน snapshot stat)
create index if not exists idx_quiz_attempts_pet_id
  on public.quiz_attempts (pet_id)
  where pet_id is not null;
