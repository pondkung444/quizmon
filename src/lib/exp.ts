export const BASE_EXP_PER_CORRECT = 10;
export const DAILY_EXP_CAP = 180;

// ข้อยกเว้นโดยตั้งใจของหลัก "EXP มาจากการตอบคำถามเท่านั้น" — คาบตั้งใจ (Focus Mode) ให้ EXP จากเวลาโฟกัส
// (เอกสารออกแบบคาบตั้งใจ ข้อ 1–2 ใน Notion). ก้อน 10 นาทีต่อเนื่อง = 10 EXP, เพดาน 50/วัน แยกถังจาก
// DAILY_EXP_CAP (ไม่กินโควตากัน). SQL เป็นคนแจกจริงตอนจบคาบ (finalize_focus_session →
// focus_award_exp ใน migration 20260925200000) เพราะคาบจบจาก trigger ปิดห้องได้ — ค่าที่นี่ต้องตรงกับใน SQL
export const FOCUS_EXP_PER_BLOCK = 10;
export const FOCUS_DAILY_EXP_CAP = 50;

// อัตราตอบถูกใน 20 ข้อล่าสุด (จากตาราง quiz_attempts) -> ตัวคูณแต้ม
// ตอบยังไม่ถึง 20 ข้อทั้งหมด -> ใช้ ×1.0 ไปก่อน
export function getAccuracyMultiplier(last20: { is_correct: boolean }[]): number {
  if (last20.length < 20) return 1.0;
  const correctRate = last20.filter((a) => a.is_correct).length / last20.length;
  if (correctRate >= 0.9) return 1.5;
  if (correctRate >= 0.7) return 1.2;
  if (correctRate >= 0.5) return 1.0;
  return 0.8;
}

// คอมโบนับข้ามรอบ 5 ข้อได้ ไม่รีเซ็ตตอนจบรอบ รีเซ็ตเฉพาะตอนตอบผิด (logic รีเซ็ตอยู่ฝั่งเรียกใช้ ไม่ใช่ในฟังก์ชันนี้)
export function getComboMultiplier(streakIncludingThisAnswer: number): number {
  if (streakIncludingThisAnswer >= 10) return 1.5;
  if (streakIncludingThisAnswer >= 8) return 1.3;
  if (streakIncludingThisAnswer >= 3) return 1.1;
  return 1.0;
}

export function calculateExpForAnswer(
  isCorrect: boolean,
  accuracyMultiplier: number,
  comboMultiplier: number,
  basePoints: number = BASE_EXP_PER_CORRECT
): number {
  if (!isCorrect) return 0;
  return Math.floor(basePoints * accuracyMultiplier * comboMultiplier);
}

// วันที่ "วันนี้" (หรือวันที่ของ date ใดๆ ที่ส่งเข้ามา) อิงเวลาไทย (Asia/Bangkok)
// กันปัญหา UTC เพี้ยนช่วงเที่ยงคืน — ไม่ส่ง date เข้ามา = ใช้เวลาปัจจุบัน
export function getTodayInBangkok(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(date);
}
