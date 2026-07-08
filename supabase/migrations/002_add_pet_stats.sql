-- Migration: 002_add_pet_stats.sql
-- วัตถุประสงค์: เพิ่มคอลัมน์ระบบสเตตัส (HP/ATK/DEF/SPD/FOC) เข้าตาราง pets
-- อ้างอิง: game-design-document-v2.md หมวด 5 และ 7.2
--
-- best_combo   -> track ระหว่างเล่น อัปเดตทุกครั้งที่ทำคอมโบสูงสุดใหม่ (runtime state, ไม่ได้บันทึกต่อข้อใน quiz_attempts)
-- stat_hp/atk/def/spd/foc -> snapshot ครั้งเดียวตอนสัตว์วิวัฒนาการถึงระยะ 4 (ร่างสมบูรณ์)
--    หลังจากนั้นค่านิ่ง ไม่คำนวณซ้ำ แม้ผู้เล่นจะตอบคำถามเพิ่มก็ตาม

alter table public.pets
  add column if not exists best_combo smallint not null default 0,
  add column if not exists stat_hp  integer,
  add column if not exists stat_atk integer,
  add column if not exists stat_def integer,
  add column if not exists stat_spd integer,
  add column if not exists stat_foc integer;

-- คำอธิบายคอลัมน์ (ขึ้นใน Supabase Table Editor ช่วยให้จำได้ตอนกลับมาดูทีหลัง)
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
