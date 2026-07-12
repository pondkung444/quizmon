-- Migration: 018_add_status_to_questions.sql
-- วัตถุประสงค์: เพิ่มคอลัมน์ status (active/inactive) ให้ตาราง questions
-- เพื่อให้ปิดการออกโจทย์บางข้อได้โดยไม่ต้องลบแถวทิ้ง (เช่นข้อที่พบว่าเฉลยผิด)
-- ค่า default 'active' กันไม่ให้ข้อเก่าหรือข้อที่ import ใหม่ (scripts/import-*.mjs)
-- หายไปจากการออกโจทย์โดยไม่ตั้งใจ

alter table public.questions
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive'));
