// เช็คว่าเวลาปัจจุบัน (เวลาไทย) อยู่ในช่วงพักกลางคืนไหม — ใช้กับ Event Push เท่านั้น
// (Scheduled Push ไม่ต้องเช็คเพราะเวลาส่งที่ตั้งไว้อยู่นอกช่วงพักอยู่แล้วโดยดีไซน์)
//
// ตาม QuizMon-Push-Notification-Design.md §9 "ช่วงพักกลางคืน":
// - จันทร์-ศุกร์: พัก 21:00–07:00
// - เสาร์-อาทิตย์: พัก 21:00–09:00
// รุ่นแรกยังไม่ให้ผู้ใช้แก้เวลาเอง (ค่าคงที่ตรงนี้จุดเดียว)
//
// Edge case ที่เอกสารไม่ได้ระบุชัด (เช่น ช่วงพักเริ่มคืนวันอาทิตย์แล้วข้ามเป็นวันจันทร์ตอนตี 2):
// ใช้ "วันที่ปัจจุบันตอนเช็ค" เป็นตัวตัดสิน morning cutoff เสมอ (ไม่ใช่วันที่เริ่มพัก) —
// เป็นการตีความอย่างสมเหตุสมผลจากเอกสาร ไม่ใช่กติกาที่ล็อกไว้ตรงๆ
export function isWithinQuietHours(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (hour === 24) hour = 0; // บาง locale คืน "24" แทน "0" สำหรับเที่ยงคืน

  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const morningEnd = isWeekend ? 9 : 7;

  return hour >= 21 || hour < morningEnd;
}
