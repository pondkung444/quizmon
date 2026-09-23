// แปลง error code ที่ RPC ของ classroom/focus raise เป็นข้อความไทยที่ไม่ตำหนิผู้ใช้
// ข้อความที่ไม่รู้จักคืนค่าเดิม (คงพฤติกรรมเดิมของ action ที่มีอยู่)

const MESSAGES: Array<[code: string, message: string]> = [
  ["classroom_activity_busy", "มีกิจกรรมอื่นกำลังเล่นอยู่ กรุณาจบกิจกรรมนั้นก่อน"],
  ["not_authorized_teacher", "บัญชีนี้ยังไม่ได้รับสิทธิ์ครู"],
  ["focus_session_not_running", "คาบตั้งใจจบไปแล้ว"],
  ["not_authorized_or_not_found", "ไม่พบห้อง หรือไม่มีสิทธิ์ทำรายการนี้"],
  ["not_a_classroom_member", "ไม่พบห้อง หรือไม่มีสิทธิ์ทำรายการนี้"],
];

export function focusErrorMessage(raw: string | null | undefined, fallback?: string): string {
  if (raw) {
    for (const [code, message] of MESSAGES) {
      if (raw.includes(code)) return message;
    }
    return raw;
  }
  return fallback ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
}

export function isFocusNotRunning(raw: string | null | undefined): boolean {
  return !!raw && raw.includes("focus_session_not_running");
}
