-- Migration: 20260804120000_quiz_attempts_add_source
-- Phase 3 (ระบบผจญภัย): เพิ่ม source ให้ quiz_attempts แยกคำถามโบนัสดันเจี้ยน (ไม่ให้ EXP, ไม่นับ
-- ลีดเดอร์บอร์ด/ปฏิทิน) ออกจากคำถามปกติ — nullable, default null = ของปกติเดิมทั้งหมด (ไม่กระทบ
-- แถวเก่า 8000+ แถว)

alter table public.quiz_attempts add column source text;

alter table public.quiz_attempts
  add constraint quiz_attempts_source_check
  check (source is null or source = 'dungeon_bonus');

comment on column public.quiz_attempts.source is
  'null = คำถามปกติ (ฝึก/ภารกิจ) ให้ EXP/นับเข้าสถิติตามปกติ. ''dungeon_bonus'' = คำถามโบนัสระหว่างผจญภัย
   (ดู submitDungeonBonusAnswer) ห้ามให้ EXP และต้องถูกกรองออกจาก weekly_scores_bkk()/
   weekly_scores_bkk_for_week()/getJourneyDaysForRange() เสมอ';

-- ============================================================
-- Rollback (รันตามลำดับนี้ถ้าต้องย้อนกลับ):
-- ============================================================
-- alter table public.quiz_attempts drop constraint if exists quiz_attempts_source_check;
-- alter table public.quiz_attempts drop column if exists source;
