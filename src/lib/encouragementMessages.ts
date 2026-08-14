export type EncouragementMessageKey = "qmon_cool" | "good_job_today" | "keep_going" | "reach_the_goal";

// ข้อความสำเร็จรูป 4 แบบ (§8.3) — ห้ามมีช่องพิมพ์อิสระ ใช้ร่วมกันระหว่าง SendEncouragementSheet
// (ตอนเลือกส่ง) กับ S08 (ตอนแสดงข้อความที่ได้รับ) กันข้อความเพี้ยนกันระหว่างสองที่
export const ENCOURAGEMENT_MESSAGES: Record<EncouragementMessageKey, string> = {
  qmon_cool: "Qmon เท่มาก!",
  good_job_today: "วันนี้ทำได้ดีมาก!",
  keep_going: "สู้ต่อไปนะ!",
  reach_the_goal: "ไปให้ถึงเป้าหมายกัน!",
};

export const ENCOURAGEMENT_MESSAGE_KEYS: EncouragementMessageKey[] = [
  "qmon_cool",
  "good_job_today",
  "keep_going",
  "reach_the_goal",
];
