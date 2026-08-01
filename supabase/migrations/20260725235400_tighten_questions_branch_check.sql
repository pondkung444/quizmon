-- ตัด 'math' ออกจาก branch ที่อนุญาต — ตัดสินใจแล้วว่า senior มี 3 สายเท่านั้น
-- (ฟิสิกส์/เคมี/ชีวะ) ไม่เพิ่มคณิต ม.6
-- เหตุผล: ถ้าปล่อย 'math' ไว้ คำถามที่ถูก tag ด้วยค่านี้จะผ่าน CHECK และเป็น active
-- แต่ไม่มีปุ่มเลือกฝึกไหนแสดง = หายเงียบโดยไม่มี error
-- ตรวจแล้ว: 0 แถวใช้ค่า 'math' อยู่ ณ เวลาที่ apply

alter table public.questions
  drop constraint questions_branch_check;

alter table public.questions
  add constraint questions_branch_check
  check (branch is null or branch = any (array['physics','chemistry','biology']));

comment on column public.questions.branch is
  'สาขาย่อยของคำถาม ม.6 (physics/chemistry/biology) ใช้กรองปุ่มเลือกฝึกและคำนวณ subline สาย senior; junior = null';
