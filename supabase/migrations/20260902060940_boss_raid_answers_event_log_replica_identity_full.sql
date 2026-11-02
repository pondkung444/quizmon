begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Supabase Realtime postgres_changes + RLS ต้องการ REPLICA IDENTITY FULL เพื่อ authorize + ส่ง payload
-- เต็มแถว (เหมือน boss_raid_sessions/participants ใน 20260828235252 phase 0.1)
-- 20260901160000 เพิ่ม 2 ตารางนี้เข้า supabase_realtime publication แต่ลืมตั้ง FULL
-- -> Realtime ตรวจ RLS ไม่ผ่าน drop INSERT event เงียบๆ (ticker/damage-float/participation-dot ไม่ทำงานเลย)
alter table public.boss_raid_answers   replica identity full;
alter table public.boss_raid_event_log replica identity full;

commit;

-- Rollback:
--   alter table public.boss_raid_answers   replica identity default;
--   alter table public.boss_raid_event_log replica identity default;