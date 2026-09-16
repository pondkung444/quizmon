-- Migration: 20260916150000_guardian_links_unique_claimed_pair
-- Guardian (ผู้พิทักษ์) — data integrity fix: กัน 2 แถว claimed พร้อมกันสำหรับ guardian/student
-- คู่เดียวกัน
--
-- บริบท: guardian_links ไม่มี constraint กัน 2 invite code คนละใบของ (guardian_id, student_id)
-- คู่เดียวกันถูก claim พร้อมกันได้ — ทำให้ guardian_get_students() คืนแถวซ้ำสำหรับนักเรียนคนเดียวกัน
-- (เจอจริงตอน build /guardian/[studentId] dashboard: ซันซันมี 2 แถว claimed ใต้ guardian
-- 792b8e1d-410c-4158-9c62-32b437b05121 ห่างกัน 7 นาที วันที่ 2026-09-14 จากการทดสอบตอนนั้น)
-- แก้ที่ frontend (dedupe ใน getGuardianStudents()) ไปแล้วรอบก่อน แต่ root cause ยังเปิดอยู่ —
-- RPC/query อื่นที่เขียนต่อไปในอนาคตที่ query guardian_links ตรงๆ (ไม่ผ่าน EXISTS check) จะเจอ
-- ปัญหาเดียวกันซ้ำ
--
-- Survey ก่อน apply (2026-09-16, ผ่าน Supabase MCP บน project wmndxiuqzrnqbhrznmfg):
--   - query `group by guardian_id, student_id having count(*) > 1` (status='claimed' เท่านั้น)
--     เจอ 1 คู่ซ้ำในทั้งตาราง: guardian 792b8e1d-410c-4158-9c62-32b437b05121 / student
--     a966f038-fe0d-4ab8-9dcf-09411ca41534 (ซันซัน) — ตรงกับที่ระบุในโจทย์เป๊ะ ไม่มีคู่อื่นซ้ำ
--   - แถวเก่า: id=82e37589-9729-49a8-9ac1-b5951e34d9ac, invite_code=EPBKTWN4,
--     claimed_at=2026-09-14 15:06:53
--   - แถวใหม่: id=33d95a01-6164-4202-bdc0-aa7f8ce6fbb2, invite_code=FZ5MUTVS,
--     claimed_at=2026-09-14 15:14:26 — เก็บแถวนี้ไว้ (ตรงกับที่ getGuardianStudents() ปัจจุบันคืน
--     เป็นแถวแรกอยู่แล้วเพราะ RPC เรียง claimed_at desc)
--   - ไม่มีตารางไหน FK ไปที่ guardian_links.id เลย (guardian_plan/guardian_goal อ้าง guardian_id/
--     student_id ตรงๆ ไม่ผ่าน guardian_links.id) — ลบแถวเก่าได้โดยไม่ต้อง cascade อะไรเพิ่ม
--
-- ทุก object ใช้ IF EXISTS / IF NOT EXISTS ให้ idempotent ยกเว้น DELETE ที่ระบุ id ตรงๆ (รันซ้ำได้
-- เพราะแถวที่ match เงื่อนไขจะไม่มีอยู่แล้วหลัง apply ครั้งแรก)

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- 1) ลบแถว claimed ที่ซ้ำซ้อน (เก่ากว่า) ของคู่ ซันซัน<->guardian ที่เจอจาก survey
--    ระบุทั้ง id + invite_code + status ให้ตรงเป๊ะกันลบผิดแถวถ้าข้อมูลเปลี่ยนไปจากตอน survey
-- ============================================================
delete from public.guardian_links
where id = '82e37589-9729-49a8-9ac1-b5951e34d9ac'
  and invite_code = 'EPBKTWN4'
  and status = 'claimed'
  and guardian_id = '792b8e1d-410c-4158-9c62-32b437b05121'
  and student_id = 'a966f038-fe0d-4ab8-9dcf-09411ca41534';

-- ============================================================
-- 2) partial unique index กัน 2 แถว claimed พร้อมกันสำหรับคู่เดียวกัน — แบบเดียวกับ
--    guardian_plan_one_active_per_student บน guardian_plan วันก่อน ยังอนุญาต pending/expired/
--    revoked ซ้ำได้ตามปกติ (จำเป็นสำหรับ flow re-invite หลัง revoke)
-- ============================================================
create unique index if not exists guardian_links_one_claimed_per_pair
  on public.guardian_links (guardian_id, student_id)
  where (status = 'claimed');

comment on index public.guardian_links_one_claimed_per_pair is
  'กัน guardian คนเดียวกัน claim invite code ของนักเรียนคนเดียวกัน 2 ใบพร้อมกัน (2 แถว claimed) — '
  'pending/expired/revoked ซ้ำได้ตามปกติ ไม่ถูกจำกัดโดย index นี้.';

commit;
