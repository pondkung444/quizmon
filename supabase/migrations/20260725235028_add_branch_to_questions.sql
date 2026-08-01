-- เพิ่มคอลัมน์ branch สำหรับแยกสาขาย่อยของคำถาม ม.6 (senior)
-- ใช้เป็น filter ของปุ่มเลือกฝึก (ฟิสิกส์/เคมี/ชีวะ) และเป็น input ของการคำนวณ subline ม.6
-- junior คงเป็น null ทั้งหมด — ไม่กระทบ flow เดิมเลย

alter table public.questions
  add column if not exists branch text;

alter table public.questions
  drop constraint if exists questions_branch_check;

alter table public.questions
  add constraint questions_branch_check
  check (branch is null or branch = any (array['physics','chemistry','biology','math']));

-- backfill จาก prefix ของ category (ตรวจแล้วว่าครอบคลุม 300/300 แถว ไม่มีตกหล่น)
update public.questions
set branch = case
      when category like 'ฟิสิกส์%' then 'physics'
      when category like 'เคมี%'    then 'chemistry'
      when category like 'ชีวะ%'    then 'biology'
    end
where grade_band = 'senior'
  and branch is null
  and (category like 'ฟิสิกส์%' or category like 'เคมี%' or category like 'ชีวะ%');

-- partial index เฉพาะแถวที่มี branch (ตอนนี้ 300 แถว) ไม่ทับกับ idx_questions_band_subject_status เดิม
create index if not exists idx_questions_branch_pick
  on public.questions (grade_band, branch, status, difficulty)
  where branch is not null;

comment on column public.questions.branch is
  'สาขาย่อยของคำถาม ม.6 (physics/chemistry/biology/math) ใช้กรองปุ่มเลือกฝึกและคำนวณ subline สาย senior; junior = null';
