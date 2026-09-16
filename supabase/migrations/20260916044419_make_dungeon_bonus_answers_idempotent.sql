alter table public.quiz_attempts
  add column if not exists choice_index integer;

comment on column public.quiz_attempts.choice_index is
  'ตัวเลือกที่ผู้เล่นกด ใช้คืน feedback เดิมอย่างถูกต้องเมื่อ request ของ dungeon bonus ถูกส่งซ้ำ';

-- เก็บแถวแรกของข้อมูลเก่าก่อนบังคับ uniqueness เพื่อให้ migration ใช้ได้กับ production ที่อาจ
-- เคยได้รับ request ซ้ำจากการ retry ของเครือข่าย
delete from public.quiz_attempts newer
using public.quiz_attempts older
where newer.source = 'dungeon_bonus'
  and older.source = 'dungeon_bonus'
  and newer.dungeon_run_id = older.dungeon_run_id
  and newer.question_id = older.question_id
  and newer.ctid > older.ctid;

create unique index if not exists quiz_attempts_dungeon_bonus_once_idx
  on public.quiz_attempts (dungeon_run_id, question_id)
  where source = 'dungeon_bonus' and dungeon_run_id is not null;
