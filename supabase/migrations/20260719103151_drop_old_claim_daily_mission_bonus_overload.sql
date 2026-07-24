-- Migration: 022_drop_old_claim_daily_mission_bonus_overload
-- version: 20260719103151 (ตรงกับ supabase_migrations.schema_migrations ใน production)
--
-- ต้องรันหลัง 20260718225509_add_food_system.sql เท่านั้น (ลำดับสำคัญ — migration นี้
-- drop overload เก่าของ claim_daily_mission_bonus(uuid) ที่ยังเหลืออยู่คู่กับเวอร์ชันใหม่
-- 2-arg หลังจาก migration ก่อนหน้าเพิ่ม p_food_type เข้าไป)

-- ยืนยันแล้วว่า codebase ไม่มี call site ไหนเรียกแบบ 1 arg เหลืออยู่ (grep ทั้งโปรเจกต์)
-- ปลอดภัยที่จะ drop overload เก่า เหลือแค่เวอร์ชัน 2-arg (p_mission_id, p_food_type default null)
drop function if exists public.claim_daily_mission_bonus(uuid);
