-- Migration: 017_add_pet_created_composite_index.sql
-- วัตถุประสงค์: เพิ่ม composite index (pet_id, created_at) รองรับ query "EXP รายวันของ pet ตัวหนึ่ง"
-- (filter pet_id + range บน created_at) ที่ฟีเจอร์ weekly journey (/pet) จะใช้
--
-- หมายเหตุ: ล่าสุดตอนเขียน migration นี้คือ 016 (ไม่ใช่ 014 ตามที่คาดไว้ตอนแรก —
-- 015/016 เพิ่มมาแล้วสำหรับ import คำถามวิทย์คลื่น/เสียง/แสง) จึงใช้เลข 017 ต่อ

create index if not exists idx_quiz_attempts_pet_created
  on public.quiz_attempts (pet_id, created_at);
