// Team Battle — ตรรกะล้วนของหน้าครู (ไม่แตะ React/DB): เลือกขอบเขตโจทย์, ตั้งเวลา, สรุปทีม
// ขอบเขตอ่านจาก view curriculum_chapter_availability — ค่า `chapter` (text) คือสตริงที่ต้องใส่ใน config.chapters

import type { BattleConfig, BattleStats, GradeBand, SetupMember, TeamId } from "./types";

export type ChapterRow = {
  id: number;
  grade_band: GradeBand;
  grade_level: string | null;
  grade_order: number | null;
  subject: string;
  branch: string | null;
  subject_label: string;
  chapter: string;
  chapter_order: number | null;
  question_count: number;
  is_available: boolean;
};

export const MAX_CHAPTERS = 30;
export const BAND_ORDER: GradeBand[] = ["primary", "junior", "senior"];
export const BAND_LABEL: Record<GradeBand, string> = {
  primary: "ประถม (ป.4–6)",
  junior: "มัธยมต้น (ม.1–3)",
  senior: "มัธยมปลาย (ม.4–6)",
};

// ---- ขอบเขต ----------------------------------------------------------------

/** ชุดโจทย์ = (grade_band, subject, branch) ชุดเดียวต่อเกม — DB บังคับ 1 วิชา/branch */
export type SubjectGroup = { key: string; subject: string; branch: string | null; label: string };

export function groupKey(r: Pick<ChapterRow, "grade_band" | "subject" | "branch">): string {
  return `${r.grade_band}|${r.subject}|${r.branch ?? ""}`;
}

export function availableBands(rows: ChapterRow[]): GradeBand[] {
  const have = new Set(rows.map((r) => r.grade_band));
  return BAND_ORDER.filter((b) => have.has(b));
}

export function subjectGroups(rows: ChapterRow[], band: GradeBand): SubjectGroup[] {
  const seen = new Map<string, SubjectGroup>();
  for (const r of rows) {
    if (r.grade_band !== band) continue;
    const key = groupKey(r);
    if (!seen.has(key)) seen.set(key, { key, subject: r.subject, branch: r.branch, label: r.subject_label });
  }
  return [...seen.values()];
}

function byOrder(a: ChapterRow, b: ChapterRow): number {
  return (
    (a.grade_order ?? Infinity) - (b.grade_order ?? Infinity) ||
    (a.chapter_order ?? Infinity) - (b.chapter_order ?? Infinity)
  );
}

/** บทของชุดที่เลือก เรียงตาม grade_order แล้ว chapter_order */
export function chaptersOfGroup(rows: ChapterRow[], key: string): ChapterRow[] {
  return rows.filter((r) => groupKey(r) === key).sort(byOrder);
}

/** จัดกลุ่มตามระดับชั้นย่อย (ม.1/ม.2 ...) ตามลำดับที่เจอ; ไม่มีระดับ → "ทั่วไป" */
export function groupByLevel(chapters: ChapterRow[]): { level: string; rows: ChapterRow[] }[] {
  const out: { level: string; rows: ChapterRow[] }[] = [];
  for (const c of chapters) {
    const level = c.grade_level ?? "ทั่วไป";
    const g = out.find((x) => x.level === level);
    if (g) g.rows.push(c);
    else out.push({ level, rows: [c] });
  }
  return out;
}

/** เพิ่มบทโดยไม่เกินเพดาน (คืนรายการใหม่ + มีบทที่ถูกตัดทิ้งหรือไม่) */
export function addChapters(
  selected: string[],
  toAdd: string[],
  max = MAX_CHAPTERS
): { next: string[]; truncated: boolean } {
  const next = [...selected];
  let truncated = false;
  for (const c of toAdd) {
    if (next.includes(c)) continue;
    if (next.length >= max) {
      truncated = true;
      break;
    }
    next.push(c);
  }
  return { next, truncated };
}

// ---- เวลา ------------------------------------------------------------------

export type Timings = { pick_seconds: number; answer_seconds: number; time_limit_minutes: number };

export const DEFAULT_TIMINGS: Timings = { pick_seconds: 15, answer_seconds: 30, time_limit_minutes: 15 };
export const TIMING_RANGE = {
  pick_seconds: { min: 5, max: 60, label: "เวลาเลือกการ์ด (วินาที)" },
  answer_seconds: { min: 10, max: 120, label: "เวลาตอบคำถาม (วินาที)" },
  time_limit_minutes: { min: 3, max: 90, label: "เวลาทั้งเกม (นาที)" },
} as const;

/** รายการข้อความช่วยเหลือเมื่อค่าอยู่นอกช่วงที่ DB รับ (ว่าง = ใช้ได้) */
export function timingProblems(t: Timings): string[] {
  const out: string[] = [];
  for (const k of Object.keys(TIMING_RANGE) as (keyof Timings)[]) {
    const { min, max, label } = TIMING_RANGE[k];
    const v = t[k];
    if (!Number.isInteger(v) || v < min || v > max) out.push(`${label} ต้องอยู่ระหว่าง ${min}–${max}`);
  }
  return out;
}

// ---- config ----------------------------------------------------------------

/** config ที่ส่งให้ RPC — ไม่ส่ง rewards_enabled/eggs_enabled (ซ่อนจนถึงเฟส 6 ใช้ค่าเริ่มต้นของ DB) */
export function buildConfig(input: {
  band: GradeBand;
  group: Pick<SubjectGroup, "subject" | "branch">;
  chapters: string[];
  timings: Timings;
}): Partial<BattleConfig> {
  return {
    grade_band: input.band,
    subject: input.group.subject,
    branch: input.group.branch,
    chapters: input.chapters,
    ...input.timings,
  };
}

/** config สำหรับนับโจทย์ — เฉพาะขอบเขต (ไม่ผูกกับค่าเวลาที่ครูกำลังพิมพ์) */
export function buildScopeConfig(input: {
  band: GradeBand;
  group: Pick<SubjectGroup, "subject" | "branch">;
  chapters: string[];
}): Partial<BattleConfig> {
  return {
    grade_band: input.band,
    subject: input.group.subject,
    branch: input.group.branch,
    chapters: input.chapters,
  };
}

// ---- ทีม -------------------------------------------------------------------

export function splitMembers(members: SetupMember[]): {
  a: SetupMember[];
  b: SetupMember[];
  spectators: SetupMember[];
} {
  const a: SetupMember[] = [];
  const b: SetupMember[] = [];
  const spectators: SetupMember[] = [];
  for (const m of members) {
    if (!m.is_player) spectators.push(m);
    else if (m.team === "a") a.push(m);
    else b.push(m);
  }
  return { a, b, spectators };
}

/** ค่าเฉลี่ย stat ของผู้เล่นทีมนั้น (ปัดเศษ) — แสดงอย่างเดียว ค่าจริงคำนวณที่ tb_start; null ถ้าไม่มีผู้เล่น */
export function averageStat(members: SetupMember[], team: TeamId): BattleStats | null {
  const ps = members.filter((m) => m.is_player && m.team === team);
  if (ps.length === 0) return null;
  const avg = (k: keyof BattleStats) =>
    Math.round(ps.reduce((s, m) => s + Number(m.stat?.[k] ?? 0), 0) / ps.length);
  return { hp: avg("hp"), atk: avg("atk"), def: avg("def"), spd: avg("spd"), foc: avg("foc") };
}

export function otherTeam(t: TeamId): TeamId {
  return t === "a" ? "b" : "a";
}
