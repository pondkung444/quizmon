-- Migration: 011_drop_duplicate_trigger.sql
-- วัตถุประสงค์: ล้าง trigger ซ้ำซ้อนบน pets ที่พบตอน sync schema.sql กับ migration 001-010
--
-- 001_create_pets_system.sql สร้าง trigger "pets_set_updated_at" ไว้ตัวหนึ่ง
-- ต่อมา 007_pets_auto_updated_at.sql สร้างอีกตัวชื่อ "trg_pets_set_updated_at"
-- (เรียก function public.set_updated_at() ตัวเดียวกัน) โดยไม่ได้ DROP ตัวแรกทิ้ง
-- ผลคือทุกครั้งที่ UPDATE pets จะมี trigger ยิงซ้ำ 2 รอบ (ไม่ทำให้ค่าเพี้ยน เพราะ
-- set updated_at = now() ซ้ำสองครั้งได้ผลลัพธ์เหมือนเดิม แต่เป็นความสิ้นเปลืองที่ไม่จำเป็น)
--
-- เก็บ trg_pets_set_updated_at (จาก 007) ไว้ตามเดิม ตัดเฉพาะตัวเก่าจาก 001 ทิ้ง

drop trigger if exists pets_set_updated_at on public.pets;
