// 5 ระดับตาม expEarned ของวันนั้น เทียบกับเพดานของผู้ใช้ (dailyCap): 0 / <1/3 / <2/3 / <เต็ม / เต็มเพดาน
// — cap 180 ได้ 0 / 1-59 / 60-119 / 120-179 / 180 เท่าเดิม, cap 300 ได้ 0 / 1-99 / 100-199 / 200-299 / 300
// ใช้ใน PetCalendarClient (heatmap เต็มเดือนใน /pet/calendar) ห้ามนิยามค่าสี/threshold ซ้ำที่อื่น
//
// ไล่เฉด indigo (เย็น) -> gold -> amber (อุ่น) แทนการไล่เฉดอำพัน/ส้มโทนเดียวเดิม (แยกยากบนพื้น
// มืดโดยเฉพาะ 2 ระดับกลาง) — ทุกสีคือ token ที่มีอยู่แล้วใน globals.css (ใช้กับ admin charts /
// nameplate อยู่ก่อน) ไม่ต้องเพิ่มสีใหม่ ความสว่างไล่ขึ้นตรงตลอด 0.09 -> 0.30 -> 0.47 -> 0.49 -> 0.54
export function expTierClass(expEarned: number, dailyCap: number): string {
  if (expEarned <= 0) return "bg-track";
  if (expEarned < dailyCap / 3) return "bg-indigo-dim";
  if (expEarned < (dailyCap * 2) / 3) return "bg-indigo";
  if (expEarned < dailyCap) return "bg-gold";
  return "bg-amber shadow-[0_0_10px_2px_var(--color-amber)]";
}

// สีตัวเลข/ตัวอักษรบนช่อง tier — แยกออกจาก expTierClass ตั้งใจ เพราะพื้นหลัง tier ไล่ตั้งแต่เกือบดำ
// (track) ไปจนถึงโทนอุ่นค่อนข้างสว่าง (gold/amber) สีตัวอักษรคงที่สีเดียวจึง contrast ไม่พอทั้งช่วง —
// ใช้ text-text (เกือบขาว) กับ 2 tier ที่มืด แล้วสลับเป็น text-track (เข้มมาก) กับ 3 tier ที่สว่างกว่า
// แทน คำนวณ contrast ratio ไว้แล้ว (WCAG luminance): track/indigo-dim กับ text-text ได้ ~17:1 และ
// ~8.8:1, ส่วน indigo/gold/amber กับ text-track ได้ ~5.3:1 / ~7.9:1 / ~6.6:1 — ทุกคู่ผ่าน AA
export function expTierTextClass(expEarned: number, dailyCap: number): string {
  return expEarned < dailyCap / 3 ? "text-text" : "text-track";
}
