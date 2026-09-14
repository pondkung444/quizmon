-- Rollback: 20260914130000_guardian_insight_phase1
-- ย้อนทุก object ที่สร้างในไฟล์ migration คู่กัน — ไม่แตะ object ของ Phase 0
-- (guardians/guardian_links/guardian_plan/guardian_goal/guardian_admin/is_guardian_admin/
-- guardian_create_invite_code/guardian_claim_invite_code/guardian_get_students/guardian_get_plan/
-- guardian_upsert_plan/guardian_upsert_goal) หรือ weekly_scores_bkk_for_week()/get_hall_of_fame_page()
-- เดิมเลย — ไฟล์นี้ลบเฉพาะของใหม่จาก Phase 1

begin;

drop function if exists public.guardian_log_insight_view(uuid);
drop function if exists public.guardian_get_qmon_display(uuid);
drop function if exists public.guardian_get_categories(uuid);
drop function if exists public.guardian_get_goal_progress(uuid);
drop function if exists public.guardian_get_weekly_calendar(uuid, date);
drop function if exists public.guardian_daily_points_bkk(uuid, date);

drop table if exists public.guardian_activity_log;

commit;
