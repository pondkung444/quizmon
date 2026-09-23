// ตำแหน่ง "สัปดาห์ที่" ของแต่ละบทเป็นค่าประมาณที่คำนวณสดทุกครั้งที่ render — DB เก็บแค่ queue_order ต่อวิชา
// + สถานะจริง (บทผ่านช้าเร็วตามการฝึกจริง ไม่ใช่ตามตาราง) จึงไม่มี column "สัปดาห์ที่ควรเรียน"
// ทุกวันที่เป็นสตริง "YYYY-MM-DD" ของเวลา Asia/Bangkok; สัปดาห์เป็น rolling window นับจากวันเริ่มแผน (ไม่ fix จันทร์–อาทิตย์)

const DAY_MS = 86_400_000;
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export type ChapterStatus = "pending" | "current" | "passed" | "stuck";

export type ScheduleChapter = {
  chapter_key: string;
  subject: string;
  branch: string | null;
  chapter: string;
  queue_order: number;
  status: ChapterStatus;
  entered_current_at: string | null;
  passed_at: string | null;
};

export type PlacedChapter = ScheduleChapter & { weekIndex: number };

export type SubjectSchedule = {
  subject: string;
  branch: string | null;
  /** ผ่านมาก่อนวันเริ่มแผน (ยกมาจากแผนเดิม) — ไม่ยัดลงสัปดาห์ใด */
  beforePlan: ScheduleChapter[];
  placed: PlacedChapter[];
};

export type WeekInfo = {
  index: number;
  startYmd: string;
  endYmd: string;
  isCurrent: boolean;
};

export function toBkkYmd(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function ymdToDays(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
}

export function addDays(ymd: string, n: number): string {
  return new Date((ymdToDays(ymd) + n) * DAY_MS).toISOString().slice(0, 10);
}

export function formatShortDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${TH_MONTHS[m - 1]}`;
}

export function formatRange(startYmd: string, endYmd: string): string {
  return `${formatShortDate(startYmd)}–${formatShortDate(endYmd)}`;
}

/** index สัปดาห์ (0-based) ของวันที่ ymd; ก่อนเริ่ม = 0, หลังจบ = n-1 (clamp) */
export function weekIndexOf(startYmd: string, ymd: string, n: number): number {
  const w = Math.floor((ymdToDays(ymd) - ymdToDays(startYmd)) / 7);
  return Math.min(n - 1, Math.max(0, w));
}

export function buildWeeks(startYmd: string, n: number, todayYmd: string): WeekInfo[] {
  const cur = weekIndexOf(startYmd, todayYmd, n);
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    startYmd: addDays(startYmd, i * 7),
    endYmd: addDays(startYmd, i * 7 + 6),
    isCurrent: i === cur,
  }));
}

export type ExamInfo = {
  examYmd: string;
  planWeeks: number;
  /** วันเต็มระหว่างวันสิ้นสุดแผน (วันเริ่ม + สัปดาห์ × 7) ถึงวันสอบ — ใช้แสดงผล; ติดลบ = แผนยาวเกินเวลาที่เหลือ */
  bufferDays: number;
  /** สัปดาห์เต็มที่เหลือระหว่างวันสิ้นสุดแผนถึงวันสอบ; ติดลบ = แผนยาวเกินเวลาที่มี */
  bufferWeeks: number;
  daysToExam: number;
};

export function examInfo(startYmd: string, n: number, examYmd: string, todayYmd: string): ExamInfo {
  const planEnd = ymdToDays(startYmd) + n * 7;
  return {
    examYmd,
    planWeeks: n,
    bufferDays: ymdToDays(examYmd) - planEnd,
    bufferWeeks: Math.floor((ymdToDays(examYmd) - planEnd) / 7),
    daysToExam: ymdToDays(examYmd) - ymdToDays(todayYmd),
  };
}

/** ช่วงเผื่อทบทวนเป็นภาษาคน: ≥7 วัน = "~X สัปดาห์" ไม่งั้น "X วัน" */
export function bufferPhrase(days: number): string {
  return days >= 7 ? `~${Math.round(days / 7)} สัปดาห์` : `${days} วัน`;
}

// อธิบายว่าทำไม "แผน N สัปดาห์" กับ "อีก M วันถึงสอบ" ไม่เท่ากัน: ส่วนต่างคือช่วงเผื่อทบทวนหลังแผนจบ
export function bufferSummary(exam: ExamInfo): { text: string; ok: boolean } {
  if (exam.bufferDays > 0)
    return { text: `แผนเข้มข้น ${exam.planWeeks} สัปดาห์ แล้วเผื่อทบทวนอีก ${bufferPhrase(exam.bufferDays)} ก่อนสอบจริง`, ok: true };
  if (exam.bufferDays === 0) return { text: "แผนจบใกล้วันสอบพอดี — ไม่มีเวลาเผื่อทบทวน", ok: true };
  return { text: "แผนอาจยาวเกินเวลาที่เหลือ ลองปรับลดสัปดาห์", ok: false };
}

/**
 * วางบทลงสัปดาห์ (ต่อวิชา) — ทุกสถานะ (ผ่านแล้ว/กำลังเรียน/ค้างนาน/รอคิว) วางตามลำดับคิวที่วางแผนไว้
 * (queue_order) กระจายเท่าๆ กันข้ามทั้ง n สัปดาห์ ไม่ใช้วันที่จริง (passed_at/entered_current_at) กำหนด
 * ตำแหน่งอีกต่อไป — ยกเว้นบทที่ผ่านก่อนวันเริ่มแผน (beforePlan) ยังคงแยกออกจากกริดเหมือนเดิม
 */
export function placeChapters(
  chapters: ScheduleChapter[],
  startYmd: string,
  n: number,
  _todayYmd: string
): SubjectSchedule[] {
  const bySubject = new Map<string, ScheduleChapter[]>();
  for (const c of chapters) {
    // จัดกลุ่มตามวิชาอย่างเดียว (ไม่แยก branch) ให้ตรงกับ guardian_set_plan_chapter_queue
    // ที่นับ queue_order แบบ partition by subject
    if (!bySubject.has(c.subject)) bySubject.set(c.subject, []);
    bySubject.get(c.subject)!.push(c);
  }

  const out: SubjectSchedule[] = [];
  for (const items of bySubject.values()) {
    const beforePlan: ScheduleChapter[] = [];
    const rest: ScheduleChapter[] = [];

    for (const c of [...items].sort((a, b) => a.queue_order - b.queue_order)) {
      if (c.status === "passed") {
        const ymd = c.passed_at ? toBkkYmd(c.passed_at) : null;
        if (ymd && ymdToDays(ymd) < ymdToDays(startYmd)) {
          beforePlan.push(c);
          continue;
        }
      }
      rest.push(c);
    }

    const m = rest.length;
    const placed: PlacedChapter[] = rest.map((c, i) => ({
      ...c,
      weekIndex: Math.min(n - 1, Math.floor((i * n) / m)),
    }));

    out.push({ subject: items[0].subject, branch: items[0].branch, beforePlan, placed });
  }
  return out.sort((a, b) => (a.subject === b.subject ? 0 : a.subject === "math" ? -1 : 1));
}

/** wizard: บทที่ติ๊กยังไม่มีสถานะจริง — ทำตาม backend (บทแรกของแต่ละวิชา = current ที่เหลือ = pending) */
export function previewChapters(
  picks: { chapter_key: string; subject: string; branch: string | null; chapter: string }[],
  passedKeys: string[] = []
): ScheduleChapter[] {
  const seen = new Set<string>();
  return picks.map((p, i) => {
    // บทที่ผ่านในแผนเดิมจะถูกยกมาเป็น passed (passed_at เก่ากว่าวันเริ่ม -> "ผ่านมาก่อนแผน")
    if (passedKeys.includes(p.chapter_key)) {
      return { ...p, queue_order: i, status: "passed", entered_current_at: null, passed_at: "1970-01-01T00:00:00Z" };
    }
    const first = !seen.has(p.subject);
    seen.add(p.subject);
    return {
      ...p,
      queue_order: i,
      status: first ? "current" : "pending",
      entered_current_at: null,
      passed_at: null,
    };
  });
}

export type FitResult = { ok: boolean; text: string };

/** ตรวจว่าจำนวนบทที่เหลือ (ไม่นับที่ผ่านแล้ว) ต่อวิชาพอดีกับสัปดาห์ที่มี */
export function checkFit(schedules: SubjectSchedule[], weeks: number, subjectName: (s: SubjectSchedule) => string): FitResult {
  const cap = weeks * MAX_CHAPTERS_PER_WEEK;
  const over = schedules
    .map((s) => ({ s, n: s.placed.length }))
    .filter((x) => x.n > cap);
  if (over.length === 0) return { ok: true, text: `จำนวนบทพอดีกับเวลา ${weeks} สัปดาห์` };
  const parts = over.map((x) => `${subjectName(x.s)} ${x.n} บท (รับได้ราว ${cap} บทใน ${weeks} สัปดาห์)`);
  return { ok: false, text: `บทมากเกินเวลาที่มี: ${parts.join(", ")} — ลดจำนวนบท หรือเลือกระยะเวลาที่ยาวขึ้น` };
}

/** ผลลัพธ์การลากวาง: ย้ายสำเร็จ (keys) หรือเหตุผลที่ย้ายไม่ได้ — ให้ UI แสดง feedback ต่างกันตามเหตุผล */
export type ReorderResult =
  | { ok: true; keys: string[] }
  | { ok: false; reason: "not-draggable" }
  | { ok: false; reason: "no-op" };

/**
 * ลากบทวิชาเดียวกัน (สถานะอะไรก็ได้ยกเว้นบทที่ผ่านมาก่อนแผน) ไปวางคอลัมน์สัปดาห์ targetWeek: DB ไม่เก็บ
 * "สัปดาห์เป้าหมาย" มีแค่ลำดับคิว จึงลองแทรกบทที่ทุกตำแหน่งในคิวของวิชานั้น (ไม่รวมบทที่ผ่านมาก่อนแผน — ไม่มี
 * ตำแหน่งสัปดาห์ให้ลากอยู่แล้ว) แล้วเลือกตำแหน่งที่ placeChapters ให้บทตกสัปดาห์ใกล้ targetWeek ที่สุด (เสมอกัน
 * = ใกล้ตำแหน่งเดิมที่สุด) คืนรายการ chapter_key ทั้งแผนตามลำดับใหม่ (รวมทุกสถานะ รวมบทที่ผ่านมาก่อนแผนด้วย —
 * guardian_set_plan_chapter_queue ลบบทที่ไม่อยู่ใน array ทิ้งทุกสถานะ ถ้าไม่ส่งมาจะโดนลบทิ้งโดยไม่ตั้งใจ)
 * สำหรับ guardian_set_plan_chapter_queue; reason "not-draggable" = บทลากไม่ได้ (บทที่ผ่านมาก่อนแผนเท่านั้น
 * ที่ลากไม่ได้), "no-op" = ตำแหน่งที่ดีที่สุดคือตำแหน่งเดิม (บทที่เหลือน้อยเกินกว่าจะกระจายละเอียดขนาดนั้น)
 */
export function reorderForDrop(
  chapters: ScheduleChapter[],
  dragKey: string,
  targetWeek: number,
  startYmd: string,
  n: number,
  todayYmd: string
): ReorderResult {
  const dragged = chapters.find((c) => c.chapter_key === dragKey);
  const isBeforePlan = (c: ScheduleChapter) =>
    c.status === "passed" && !!c.passed_at && ymdToDays(toBkkYmd(c.passed_at)) < ymdToDays(startYmd);
  if (!dragged || isBeforePlan(dragged)) return { ok: false, reason: "not-draggable" };

  const byOrder = (a: ScheduleChapter, b: ScheduleChapter) => a.queue_order - b.queue_order;
  const all = [...chapters].sort(byOrder);
  const others = all.filter((c) => c.subject !== dragged.subject);
  const mineAll = all.filter((c) => c.subject === dragged.subject);
  // บทที่ผ่านมาก่อนแผนของวิชานี้: ตำแหน่งในคิวไม่มีผลต่อ weekIndex ของบทอื่น (placeChapters ตัดออกก่อน
  // คำนวณเสมอ) เลยแค่วางไว้หน้าสุดของกลุ่มที่ลากสลับกันได้ ไม่ต้องหาตำแหน่งให้
  const beforePlan = mineAll.filter(isBeforePlan);
  const movable = mineAll.filter((c) => !isBeforePlan(c));
  const rest = movable.filter((c) => c.chapter_key !== dragKey);
  const origJ = rest.filter((c) => c.queue_order < dragged.queue_order).length;

  let best: { j: number; dist: number; move: number } | null = null;
  for (let j = 0; j <= rest.length; j++) {
    const cand = [...rest.slice(0, j), dragged, ...rest.slice(j)];
    const rows = [...beforePlan, ...cand.map((c, i) => ({ ...c, queue_order: i }))];
    const placed = placeChapters(rows, startYmd, n, todayYmd)[0]?.placed.find((c) => c.chapter_key === dragKey);
    if (!placed) continue;
    const dist = Math.abs(placed.weekIndex - targetWeek);
    const move = Math.abs(j - origJ);
    if (!best || dist < best.dist || (dist === best.dist && move < best.move)) best = { j, dist, move };
  }
  if (!best || best.j === origJ) return { ok: false, reason: "no-op" };

  const newMine = [...beforePlan, ...rest.slice(0, best.j), dragged, ...rest.slice(best.j)];
  return { ok: true, keys: [...others, ...newMine].map((c) => c.chapter_key) };
}

export type Strength ="weak" | "mid" | "strong" | "unknown";

export function strengthOf(accuracy: number | null, attempts: number, minAttempts: number): Strength {
  if (accuracy === null || attempts < minAttempts) return "unknown";
  if (accuracy >= 80) return "strong";
  if (accuracy >= 50) return "mid";
  return "weak";
}

export const STRENGTH_LABEL: Record<Strength, string> = {
  weak: "อ่อน",
  mid: "ปานกลาง",
  strong: "แข็งแรง",
  unknown: "ยังไม่มีข้อมูล",
};

/** จำนวนบทต่อสัปดาห์สูงสุดที่ยังถือว่า "พอดีเวลา" (สัปดาห์ละ 1–2 บทต่อวิชา) */
export const MAX_CHAPTERS_PER_WEEK = 2;
