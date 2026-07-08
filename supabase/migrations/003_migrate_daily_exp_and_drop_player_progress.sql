-- Migration: 003_migrate_daily_exp_and_drop_player_progress.sql
-- วัตถุประสงค์: ย้าย logic เพดานรายวัน (soft cap) จาก player_progress มาไว้ใน pets แล้วตัดตารางเก่าทิ้ง
--
-- เหตุผล: ตรวจ schema player_progress แล้วพบว่าทุกคอลัมน์ถูกแทนที่ด้วย pets หมดแล้ว
--         (user_id/exp/pet_stage/egg_type) ยกเว้น exp_today + exp_today_date ที่คุม soft cap 180 EXP/วัน
--         ซึ่งยังไม่มีอยู่ใน pets -> ต้องเพิ่มก่อนถึงจะ drop ตารางเก่าได้อย่างปลอดภัย
--
-- หมายเหตุ: player_progress ยังเป็น test/dev data ล้วน ไม่มีข้อมูลผู้เล่นจริงต้องเก็บ
--          จึง drop ตรงๆ ได้เลย ไม่ต้องเขียน backfill script

-- 1) เพิ่มคอลัมน์ soft cap เข้า pets
alter table public.pets
  add column if not exists exp_today integer not null default 0,
  add column if not exists exp_today_date date not null default current_date;

comment on column public.pets.exp_today is
  'EXP ที่ตัวนี้ได้รับวันนี้ (นับเทียบ soft cap 180/วัน) — โค้ดต้องรีเซ็ตเป็น 0 เมื่อ exp_today_date ไม่ใช่วันนี้';
comment on column public.pets.exp_today_date is
  'วันที่ล่าสุดที่นับ exp_today ไว้ ใช้เทียบกับ current_date เพื่อรู้ว่าต้องรีเซ็ตยอดวันใหม่หรือยัง';

-- 2) ตัดตารางเก่าทิ้ง (superseded โดย pets ทั้งหมดแล้ว, เป็น test data ไม่ต้อง backfill)
drop table if exists public.player_progress;
