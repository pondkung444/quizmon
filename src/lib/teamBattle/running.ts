// Team Battle — เกม "กำลังเล่น" หรือไม่ ตัดสินจากสถานะ battle ไม่ใช่ current_activity เดี่ยวๆ
// (เกมจบแล้วห้องยังค้าง current_activity='team_battle' + pointer เก่า — ดู student.ts shouldRedirectToBattle)
// setup/active = กำลังเล่น (DB นับเป็น busy: classroom_activity_is_busy); finished/abandoned/ไม่พบ/ยังไม่รู้ = ไม่

export function isTeamBattleRunning(status: string | null | undefined): boolean {
  return status === "setup" || status === "active";
}
