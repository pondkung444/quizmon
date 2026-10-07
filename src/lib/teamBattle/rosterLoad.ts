// Team Battle — ตัวโหลดรายชื่อ Qmon ของจอกลาง (ตรรกะล้วน ไม่แตะ React → เทสได้โดยไม่ต้อง render)
// โหลดครั้งเดียวตอนเกมพ้น setup; ล้มเหลวลองใหม่ได้ 1 ครั้งหลัง ~3 วิ แล้วหยุด
// ห้ามผูกกับ realtime/membersVersion: tb_sync_roster อัปเดตทุกแถวทุกครั้ง → refetch วนไม่รู้จบ (บทเรียน 4.2)

export const ROSTER_RETRY_MS = 3000;

/** ล้มเหลวมาแล้วกี่ครั้ง → รอกี่ ms ก่อนลองใหม่ (null = หยุด). ลองใหม่ได้ 1 ครั้งเท่านั้น (รวมเป็น 2 ครั้งสูงสุด) */
export function rosterRetryDelay(failedAttempts: number): number | null {
  return failedAttempts === 1 ? ROSTER_RETRY_MS : null;
}

export type RosterLoader = {
  /** component mount (หรือ mount ซ้ำของ StrictMode) — ผลที่ค้างอยู่/การลองใหม่ที่ถูกพักไว้จะเดินต่อ */
  attach(): void;
  /** component cleanup (StrictMode จำลอง หรือ unmount จริง) — เลิกจับเวลา ไม่ส่งผลเข้า component */
  detach(): void;
  /** เริ่มโหลด (idempotent: เรียกกี่ครั้งก็ยิงชุดเดียว) */
  start(): void;
};

/**
 * ตัวโหลดคงอยู่ข้ามรอบ mount→cleanup→mount ของ StrictMode (เก็บใน useMemo ของ hook):
 * - "เคยเริ่มแล้ว" เป็นของตัวโหลด ไม่ใช่ของ effect → effect รอบสองเรียก start() ซ้ำได้โดยไม่ยิงซ้ำ
 * - ผลของ request ใช้ได้เมื่อ attached เท่านั้น; ถ้า cleanup มาคั่น ผลถูกพักไว้ แล้วส่งตอน attach ใหม่
 *   (unmount จริงไม่มี attach ใหม่ → ไม่ส่งอะไรเข้า component ที่ตายแล้ว)
 * - cleanup ระหว่างรอ retry → เลิกตัวจับเวลา แล้วตั้งใหม่ตอน attach ใหม่ (unmount จริง → ไม่ยิงต่อ)
 */
export function createRosterLoader<T>(deps: {
  fetch: () => Promise<T>;
  onLoaded: (value: T) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}): RosterLoader {
  let attached = false;
  let started = false;
  let failed = 0;
  let timer: unknown = null;
  let retryPending = false; // รอรอบ retry อยู่ (อาจถูกพักเพราะ detach)
  let held: { value: T } | null = null; // ผลที่มาถึงตอน detach

  const schedule = (ms: number) => {
    timer = deps.setTimer(() => {
      timer = null;
      retryPending = false;
      void run();
    }, ms);
  };

  const run = async (): Promise<void> => {
    try {
      const value = await deps.fetch();
      if (attached) deps.onLoaded(value);
      else held = { value };
    } catch {
      failed += 1;
      const delay = rosterRetryDelay(failed);
      if (delay === null) return;
      retryPending = true;
      if (attached) schedule(delay); // detach อยู่ → พักไว้ ตั้งตอน attach
    }
  };

  return {
    attach() {
      attached = true;
      if (held) {
        const { value } = held;
        held = null;
        deps.onLoaded(value);
      }
      if (retryPending && timer === null) schedule(rosterRetryDelay(failed) ?? 0);
    },
    detach() {
      attached = false;
      if (timer !== null) {
        deps.clearTimer(timer);
        timer = null;
      }
    },
    start() {
      if (started) return;
      started = true;
      void run();
    },
  };
}
