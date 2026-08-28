-- Migration: 20260828000000_quiz_attempts_source_topic_select
-- โหมด "เลือกบทฝึกฝน" (topic-select practice): นักเรียนเลือกฝึกเฉพาะบท ไม่นับ leaderboard
-- ใช้ pattern เดียวกับ dungeon_bonus/raid_obstacle/raid_boss — quiz_attempts.source = 'topic_select'
-- ทุกแถวที่ตอบในโหมดนี้ EXP ยังให้ปกติ (exp.ts ไม่กรองตาม source) แต่ weekly_scores_bkk() ฯลฯ
-- กรอง source IS NULL อยู่แล้ว จึงไม่หลุดเข้า leaderboard/ปฏิทิน โดยไม่ต้องแก้ฟังก์ชันพวกนั้น

alter table public.quiz_attempts drop constraint if exists quiz_attempts_source_check;
alter table public.quiz_attempts
  add constraint quiz_attempts_source_check
  check (source is null or source in ('dungeon_bonus', 'raid_obstacle', 'raid_boss', 'topic_select'));

comment on column public.quiz_attempts.source is
  'null = คำถามปกติ (ฝึก/ภารกิจ) ให้ EXP + นับเข้าสถิติ/leaderboard ตามปกติ.
   ''dungeon_bonus'' = โบนัสระหว่างผจญภัย (ไม่ให้ EXP, ต้องกรองออกจาก weekly_scores_bkk()).
   ''raid_obstacle'' / ''raid_boss'' = คำถามระหว่าง raid.
   ''topic_select'' = โหมดเลือกบทฝึกฝน — ให้ EXP ปกติ แต่ไม่นับ leaderboard (กรองผ่าน source IS NULL).';

-- ============================================================
-- Rollback:
-- ============================================================
-- alter table public.quiz_attempts drop constraint if exists quiz_attempts_source_check;
-- alter table public.quiz_attempts
--   add constraint quiz_attempts_source_check
--   check (source is null or source in ('dungeon_bonus', 'raid_obstacle', 'raid_boss'));
