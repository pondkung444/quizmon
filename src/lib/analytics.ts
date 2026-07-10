// Client-side analytics buffer — ยังไม่มีหน้าไหนเรียก track() จริง (วางท่อไว้ก่อน)
// ต้อง import/เรียกจาก client component เท่านั้น (ใช้ window/navigator/crypto.randomUUID)
//
// ตั้งใจไม่ใช้ server action ส่ง event (ดูเหตุผลใน supabase/migrations/014_analytics_events.sql):
// sendBeacon กำหนด header เองไม่ได้ เรียก server action (ต้องมี header Next-Action) ไม่ได้เลย
// และ server action ทุกตัวถูก Next.js dispatch เรียงคิวเดียวกันฝั่ง client — ถ้าฝัง analytics
// เป็น server action จะไปแย่งคิวกับ submitAnswer (src/app/quiz/actions.ts) โดยไม่ตั้งใจ
// จึงยิงตรงไป route handler ธรรมดาที่ src/app/api/analytics/route.ts แทน

const FLUSH_INTERVAL_MS = 10_000;
const ENDPOINT = "/api/analytics";

export type AnalyticsProps = Record<string, unknown>;

type BufferedEvent = {
  event_name: string;
  screen: string;
  pet_id: string | null;
  props: AnalyticsProps;
  client_ts: string;
  session_id: string;
};

let sessionId: string | null = null;
let buffer: BufferedEvent[] = [];
let autoFlushStarted = false;

export function getSessionId(): string {
  if (!sessionId) {
    sessionId = crypto.randomUUID();
  }
  return sessionId;
}

function ensureAutoFlush() {
  if (autoFlushStarted || typeof window === "undefined") return;
  autoFlushStarted = true;

  setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  // ปิดแท็บ/สลับแอป: fetch ธรรมดาโดน browser cancel กลางทางได้ ต้องใช้ sendBeacon แทน
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushWithBeacon();
    }
  });
}

export function track(eventName: string, props: AnalyticsProps = {}, petId: string | null = null): void {
  if (typeof window === "undefined") return;
  ensureAutoFlush();

  buffer.push({
    event_name: eventName,
    screen: window.location.pathname,
    pet_id: petId,
    props,
    client_ts: new Date().toISOString(),
    session_id: getSessionId(),
  });
}

// fire-and-forget เสมอ: caller ไม่ต้อง await ก็ได้ ถ้า await ก็จะไม่มีวัน throw ใส่
export async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];

  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    // เก็บ event ตกไปเงียบๆ — ห้ามให้ analytics พังการเล่นจริง
  }
}

function flushWithBeacon(): void {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];

  const blob = new Blob([JSON.stringify({ events })], { type: "application/json" });
  const accepted = navigator.sendBeacon?.(ENDPOINT, blob);

  if (!accepted) {
    // browser ปฏิเสธ beacon (เช่น payload เกิน limit ของ browser) — ลอง fetch keepalive เป็น fallback
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {});
  }
}
