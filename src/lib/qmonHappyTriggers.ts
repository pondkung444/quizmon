// Qmon Animation v1 เฟส 4 — ค่าคงที่และ logic ล้วน (ไม่มี React/DOM) ของ trigger ท่า Happy บนการ์ดหลัก /pet
// จูนค่าได้ที่นี่ที่เดียว · ทดสอบด้วย node: scripts/sprite/verify-happy-triggers.mts

export const RANDOM_START_DELAY_MS = 20_000; // อยู่ /pet เกินนี้ก่อนเริ่มสุ่ม
export const RANDOM_CHANCE_PER_LOOP = 0.15; // ต่อ 1 รอบ Idle (3.2 วิ) → คาดว่า Happy ~1 ครั้ง/นาทีหลัง cooldown
export const RANDOM_COOLDOWN_MS = 45_000; // นับจาก Happy ล่าสุดจบ (ทุก trigger)
export const QUIZ_HAPPY_TTL_MS = 10 * 60_000;
export const QUIZ_HAPPY_KEY = "qmon:happyAfterQuiz";

export type RandomTuning = { startDelayMs: number; chance: number; cooldownMs: number };
export const DEFAULT_RANDOM_TUNING: RandomTuning = {
  startDelayMs: RANDOM_START_DELAY_MS,
  chance: RANDOM_CHANCE_PER_LOOP,
  cooldownMs: RANDOM_COOLDOWN_MS,
};
// ?animRandom=fast (ไม่ใช่ production): เห็นการสลับตอนจบรอบ Idle ได้ทันที
export const FAST_RANDOM_TUNING: RandomTuning = { startDelayMs: 2_000, chance: 1, cooldownMs: 6_000 };

// ควรสุ่มเล่น Happy ในรอบ Idle นี้ไหม (ตัวสุ่มส่งเข้ามาเพื่อทดสอบได้)
export function shouldPlayRandomHappy(
  s: { now: number; mountedAt: number; lastHappyEndAt: number | null; hidden: boolean; queued: boolean },
  tuning: RandomTuning,
  rand: number,
): boolean {
  if (s.hidden || s.queued) return false;
  if (s.now - s.mountedAt < tuning.startDelayMs) return false;
  if (s.lastHappyEndAt !== null && s.now - s.lastHappyEndAt < tuning.cooldownMs) return false;
  return rand < tuning.chance;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getSessionStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// จบ quiz (บันทึกผลสำเร็จ) → ทำเครื่องหมายให้ /pet เล่น Happy ตอนกลับมา (เขียนทุกครั้งไม่ว่าคะแนนเท่าไร)
export function markQuizHappy(storage: Pick<StorageLike, "setItem"> | null, now: number) {
  try {
    storage?.setItem(QUIZ_HAPPY_KEY, String(now));
  } catch {
    // storage ใช้ไม่ได้ (private mode ฯลฯ) — ข้ามไป ไม่กระทบ UI
  }
}

// none = ไม่มี key · fresh = ยังไม่หมดอายุ · stale = หมดอายุ/ค่าเพี้ยน (ผู้เรียกควรลบทิ้ง)
export function readQuizHappy(storage: Pick<StorageLike, "getItem"> | null, now: number): "none" | "fresh" | "stale" {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(QUIZ_HAPPY_KEY) ?? null;
  } catch {
    return "none";
  }
  if (raw === null) return "none";
  const at = Number(raw);
  if (!Number.isFinite(at) || now - at > QUIZ_HAPPY_TTL_MS || at > now + 60_000) return "stale";
  return "fresh";
}

export function clearQuizHappy(storage: Pick<StorageLike, "removeItem"> | null) {
  try {
    storage?.removeItem(QUIZ_HAPPY_KEY);
  } catch {
    // ข้าม
  }
}
