-- แก้ไข 2026-07-24: ไฟล์นี้เดิมตั้งใจเพิ่มทั้ง phone และ school พร้อมแก้
-- handle_new_user() ให้ดึง phone/school จาก raw_user_meta_data ด้วย แต่ตรวจกับ
-- production จริงผ่าน Supabase MCP (list_tables + pg_get_functiondef) แล้วพบว่า
-- ไม่เคย apply ตามนี้ทั้งหมด — production มีแค่ column school (ไม่มี phone) และ
-- handle_new_user() ยังเป็นเวอร์ชันของ 008_fix_handle_new_user_starter_egg.sql
-- (insert แค่ id, username) เท่านั้น จึงแก้ไฟล์นี้ให้ตรงกับสิ่งที่ apply จริง
-- ไม่แตะ production เพิ่ม — ถ้าจะเพิ่ม phone column จริงในอนาคตต้องเป็น migration ใหม่

-- เพิ่มฟิลด์โรงเรียนให้โปรไฟล์ผู้ใช้ (กรอกตอนสมัครสมาชิก)
alter table public.profiles
  add column if not exists school text;
