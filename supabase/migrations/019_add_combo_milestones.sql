-- Migration: 019_add_combo_milestones.sql
-- วัตถุประสงค์: เพิ่มคอลัมน์สะสม "milestone คอมโบ" ให้ pets เพื่อใช้เป็น raw SPD แทน best_combo
-- เหตุผล: best_combo เป็น extreme-value stat (พลาดข้อเดียวรีเซ็ต) ต้องตอบถูกติดกัน 77 ข้อไม่พลาดเลย
-- ถึงจะชน cap ซึ่งแทบเป็นไปไม่ได้จริง ขัดกับหลักออกแบบ "ให้คุณค่าความพยายามพอๆ กับความเก่ง"
-- ดู logic increment ที่ src/app/quiz/actions.ts (MILESTONE_INTERVAL) และการใช้เป็น raw SPD ที่
-- src/lib/evolution.ts (computeRawStats) — best_combo เดิมยังเก็บไว้ไม่ลบ (เผื่อโชว์เป็นสถิติแยก)

alter table public.pets
  add column if not exists combo_milestones integer not null default 0;

comment on column public.pets.combo_milestones is
  'จำนวนครั้งที่ current streak (ตัวเดียวกับที่เทียบกับ best_combo) หารด้วย MILESTONE_INTERVAL (3) ลงตัว หลังตอบถูก — milestone counter สะสม (runtime, อัปเดตระหว่างเล่น) ใช้เป็น raw SPD ตอน snapshot แทน best_combo เดิมที่เป็น extreme-value stat';
