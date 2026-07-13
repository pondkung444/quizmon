-- Migration: 020_atomic_combo_update.sql
-- วัตถุประสงค์: แก้ lost-update race condition บน pets.best_combo / pets.combo_milestones /
-- pets.math_correct / pets.science_correct
-- เหตุผล: submitAnswer() เดิมอ่านทั้ง 4 คอลัมน์นี้มา snapshot ต้น request แล้วคำนวณค่าใหม่
-- ฝั่ง app (เช่น activePet.combo_milestones + 1, activePet.math_correct + 1) ก่อนเขียนกลับ —
-- ถ้ามีคำขอที่ทับซ้อนกัน (เช่น เปิดสองแท็บ/สองอุปกรณ์พร้อมกัน) แต่ละคำขออ่าน snapshot เก่า
-- คนละช่วงเวลา ทำให้บาง increment หายถาวร พิสูจน์แล้วจากข้อมูลจริง 2 เคส:
--   - user 'Dawu' pet 7547ebe1...: combo_milestones ค้างที่ 0 ทั้งที่ควรเป็นอย่างน้อย 7
--   - user 'Dawu' pet da7d950a... (retired): math_correct ควรเป็น 20 มีแค่ 17,
--     science_correct ควรเป็น 103 มีแค่ 81
--
-- best_combo รอดจาก race นี้เป็นส่วนใหญ่โดยบังเอิญเพราะเป็น running max (self-heal ได้แม้บาง
-- write หาย) แต่ก็ไม่รอด 100% เจอ pet ที่ best_combo ต่ำกว่าความจริงด้วยเช่นกัน (เช่น 5→10)
-- ส่วนอีก 3 คอลัมน์เป็น +1 accumulator ล้วนๆ ไม่มีทาง reconstruct ค่าที่ถูกต้องคืนจาก DB เองได้
-- เลยรวมทุกคอลัมน์ที่ submitAnswer() ต้องอัปเดตต่อ 1 คำตอบไว้ใน RPC เดียว (1 UPDATE statement,
-- atomic ทั้งแถว) ไม่ผ่านการอ่านค่ามาบวก/เทียบฝั่ง app อีกต่อไป
--
-- ตั้งใจ "language sql" (ไม่ใช่ plpgsql) เพราะมีแค่ UPDATE...RETURNING ประโยคเดียว และไม่ระบุ
-- security definer (ใช้ security invoker ตาม default) — รันด้วยสิทธิ์ผู้เรียก (RLS policy
-- "pets: update own" ยังคุมอยู่เหมือนเดิม เพราะ submitAnswer เรียกผ่าน client ที่ผูก session
-- ผู้ใช้จริง ไม่ใช่ admin client)

create or replace function public.apply_quiz_answer_pet_update(
  p_pet_id uuid,
  p_new_combo integer,
  p_milestone_increment integer,
  p_math_increment integer,
  p_science_increment integer
)
returns table (
  best_combo smallint,
  combo_milestones integer,
  math_correct integer,
  science_correct integer
)
language sql
as $$
  update public.pets
  set
    best_combo = greatest(best_combo, p_new_combo::smallint),
    combo_milestones = combo_milestones + p_milestone_increment,
    math_correct = math_correct + p_math_increment,
    science_correct = science_correct + p_science_increment
  where id = p_pet_id
  returning best_combo, combo_milestones, math_correct, science_correct;
$$;

grant execute on function public.apply_quiz_answer_pet_update(uuid, integer, integer, integer, integer) to authenticated;
