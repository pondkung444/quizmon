import type { ReactNode } from "react";

// คำที่ห้ามตกบรรทัดกลางคำบนจอแคบ (360/390): "{n} EXP", "{n} ข้อ", "เหรียญฟาร์ม", "การผจญภัย", "ไข่ใบใหม่มาฟัก"
const KEEP_TOGETHER = /(\d+ EXP|\d+ ข้อ|เหรียญฟาร์ม|การผจญภัย|ไข่ใบใหม่มาฟัก)/;

export function keepTogether(text: string): ReactNode {
  return text.split(KEEP_TOGETHER).map((part, i) =>
    i % 2 ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
