-- พบระหว่างทดสอบ delete_own_account() (20260825000001) ว่า player_feedback.user_id เป็น NOT NULL จริง
-- ทำให้ anonymize ด้วย `set user_id = null` ตามที่ตั้งใจไว้ (เก็บ feedback ไว้อ้างอิงแต่ตัดการเชื่อมโยงตัวตน
-- เมื่อผู้ใช้ลบบัญชี — ตารางนี้ระบุ "append-only ห้าม update/delete" เนื้อหา แต่ user_id มีไว้เพื่อ safety
-- follow-up เท่านั้น) ทำไม่ได้จริง ต้องเปิดให้ column เป็น null ได้ก่อน
--
-- ตรวจแล้วว่าไม่กระทบโค้ดที่มีอยู่: src/app/feedback/actions.ts ใช้ user_id แค่ตอน insert (มีค่าเสมอ)
-- กับ select เพื่อเช็คว่า user ปัจจุบันเคยส่ง feedback ไปแล้วหรือยัง (ไม่มี path ที่ query ด้วย user_id = null)
alter table public.player_feedback alter column user_id drop not null;
