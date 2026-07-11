import { PERSONALITY_MESSAGES, type PersonalityEventKey } from "@/lib/personalityMessages";
import type { Subline } from "@/lib/evolution";

export type PersonalityKey = "stage2" | "math" | "science" | "balance";

// DB เก็บ subline เป็น "balanced" (มี d) แต่ key ชุดข้อความคือ "balance" (ไม่มี d)
// แปลงผ่าน lookup map จุดเดียวเท่านั้น ห้าม string-concat ตรงๆ (เหมือน SUBLINE_FILE_NAME ใน petImage.ts)
const SUBLINE_TO_PERSONALITY_KEY: Record<Subline, PersonalityKey> = {
  math: "math",
  science: "science",
  balanced: "balance",
};

export function getPersonalityKey(stage: number, subline: string | null): PersonalityKey {
  if (stage <= 2) return "stage2";
  if (subline === "math" || subline === "science" || subline === "balanced") {
    return SUBLINE_TO_PERSONALITY_KEY[subline];
  }
  // stage >= 3 แต่ subline ยังไม่ถูก set (เช่นข้อมูลกำลัง sync) — fallback ปลอดภัยสุดคือ stage2
  return "stage2";
}

// จำประโยคล่าสุดต่อ event ไว้ กันสุ่มได้ประโยคเดิมซ้ำติดกัน
const lastMessageByEvent = new Map<PersonalityEventKey, string>();

export function getMessage(event: PersonalityEventKey, personality: PersonalityKey): string | null {
  const pool = PERSONALITY_MESSAGES[event]?.[personality];
  if (!pool || pool.length === 0) return null;

  if (pool.length === 1) {
    lastMessageByEvent.set(event, pool[0]);
    return pool[0];
  }

  const last = lastMessageByEvent.get(event);
  const candidates = last ? pool.filter((msg) => msg !== last) : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  lastMessageByEvent.set(event, picked);
  return picked;
}
