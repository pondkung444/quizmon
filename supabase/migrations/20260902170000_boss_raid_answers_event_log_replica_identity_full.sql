-- Migration: 20260902170000_boss_raid_answers_event_log_replica_identity_full
-- Classroom Boss Raid — bugfix: TV ticker / damage-float / participation-dot ไม่ทำงานเลยตอนเทสสด
--
-- 20260901160000 เพิ่ม boss_raid_answers + boss_raid_event_log เข้า supabase_realtime publication
-- แต่ปล่อย replica identity เป็น default (คอมเมนต์ตอนนั้นว่า "insert-only ไม่ต้อง FULL" — ผิด)
--
-- Supabase Realtime postgres_changes เมื่อ RLS เปิด ต้องการ REPLICA IDENTITY FULL เพื่อ authorize
-- การเปลี่ยนแปลงต่อ subscriber (ตรวจ policy กับแถวที่ replicate มา) — ไม่มี FULL = Realtime drop
-- event เงียบๆ ไม่ error ที่ client เลย นี่คือเหตุผลที่ 20260828235252 (phase 0.1) ตั้ง FULL ให้
-- boss_raid_sessions/participants ไว้ตั้งแต่แรก (คอมเมนต์เดิม: "จำเป็นต่อการประเมิน RLS ของ row")
--
-- ทั้งสองตารางเขียนผ่าน security-definer RPC เท่านั้น (append-heavy; event_log มี UPDATE ตอน claim
-- ผู้ชนะ meteor) — FULL แค่ทำให้ WAL record เต็มแถว ไม่กระทบ logic การเขียน

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.boss_raid_answers   replica identity full;
alter table public.boss_raid_event_log replica identity full;

commit;

-- ============================================================
-- Rollback:
--   alter table public.boss_raid_answers   replica identity default;
--   alter table public.boss_raid_event_log replica identity default;
-- ============================================================
