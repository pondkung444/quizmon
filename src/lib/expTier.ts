// 5 ระดับตาม expEarned ของวันนั้น: 0 / 1-59 / 60-119 / 120-179 / 180 (เต็มเพดาน) — ใช้ร่วมกันทั้ง
// WeeklyJourneyCard (แถบสัปดาห์ใน /pet) และ PetCalendarClient (heatmap เต็มเดือนใน /pet/calendar)
// ห้ามนิยามค่าสี/threshold ซ้ำที่อื่น เพื่อให้สองหน้าตรงกันเสมอ
export function expTierClass(expEarned: number): string {
  if (expEarned <= 0) return "bg-track";
  if (expEarned < 60) return "bg-border";
  if (expEarned < 120) return "bg-amber-dim/60";
  if (expEarned < 180) return "bg-amber/70";
  return "bg-amber shadow-[0_0_10px_2px_var(--color-amber)]";
}
