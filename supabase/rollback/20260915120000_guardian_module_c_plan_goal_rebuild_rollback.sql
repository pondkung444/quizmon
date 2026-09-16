-- Rollback for: 20260915120000_guardian_module_c_plan_goal_rebuild.sql
-- ไม่ auto-apply — เก็บไว้คู่กัน manual only ตาม workflow (Survey -> Draft -> Confirm -> Execute -> Verify)
-- Idempotent: ใช้ IF EXISTS ทุกจุด รันซ้ำได้โดยไม่ error
--
-- คำเตือน: rollback นี้ drop ตารางใหม่ (guardian_plan/guardian_plan_chapters/guardian_goal) ทิ้งทั้งหมด
-- ไม่ restore เนื้อหาตารางเดิม (flat category + weekly-target-count) เพราะ migration ต้นทาง
-- ยืนยันแล้วว่าไม่มี real user data ในตารางเดิมตอน apply — ถ้ามีใครตั้งแผน/เป้าหมายใหม่หลัง apply
-- ไฟล์นี้ไปแล้ว ข้อมูลนั้นจะหายเมื่อ rollback ต้อง export ก่อนถ้าจำเป็น

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 5) guardian_goal ใหม่
drop table if exists public.guardian_goal cascade;

-- 4) guardian_plan_chapters
drop table if exists public.guardian_plan_chapters cascade;

-- 3) guardian_plan ใหม่
drop table if exists public.guardian_plan cascade;

-- 1) restore old RPC signatures เป็น stub ว่าง — ไม่ restore logic เดิมแบบ blind เพราะเสี่ยง
--    schema drift (บทเรียนเดิม) ถ้าต้องการ logic เดิมจริง ต้องดึงจาก
--    20260914120000_guardian_schema_phase0.sql (guardian_get_plan, guardian_upsert_plan,
--    guardian_upsert_goal) และจาก prod prosrc ปัจจุบัน (guardian_get_goal_progress,
--    guardian_get_categories — ไม่มีอยู่ใน repo migration ไฟล์ไหนเลย ต้องดึงจาก DB ตรงก่อน restore)
--    ไฟล์นี้แค่ drop table ใหม่ทิ้ง ไม่ auto-restore ฟังก์ชันเดิม — ต้องทำ manual ถ้าต้องการจริงๆ

commit;
