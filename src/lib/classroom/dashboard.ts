import type { ClassroomRosterRow } from "./roster";

// shape ของ jsonb จาก get_teacher_dashboard / get_teacher_class_detail
// (supabase/migrations/20260925120000_teacher_classes_dashboard.sql)

export type SessionSummary = {
  id: string;
  title: string | null;
  class_id: string | null;
  join_code: string;
  status: "lobby" | "active" | "ended";
  created_at: string;
  ended_at: string | null;
  participants: number;
  raids: { result: "win" | "lose" | null; status: string; correct: number; answers: number }[];
  focus: { minutes: number; running: boolean; participants: number }[];
  picks: number;
};

export type DashboardClass = {
  id: string;
  name: string;
  created_at: string;
  session_count: number;
  last_session_at: string | null;
  student_count: number;
  raid_answers: number;
  raid_correct: number;
  open_session: { id: string; join_code: string; participants: number } | null;
};

export type TeacherDashboard = {
  days: number;
  stats: {
    sessions: number;
    students: number;
    raid_answers: number;
    raid_correct: number;
    focus_seconds: number;
  };
  classes: DashboardClass[];
  open_sessions: SessionSummary[];
  recent_sessions: SessionSummary[];
};

export type ClassStudent = Omit<ClassroomRosterRow, "joined_at"> & {
  attended: number;
  last_seen: string;
  raid_answers: number;
  raid_correct: number;
  focus_seconds: number;
  picked: number;
};

export type ClassTopic = { subject: string; chapter: string; answers: number; correct: number };

export type ClassDetail = {
  class: { id: string; name: string; created_at: string; archived_at: string | null };
  total_sessions: number;
  sessions: SessionSummary[];
  students: ClassStudent[];
  topics: ClassTopic[];
};

/** % ตอบถูก ปัดเป็นจำนวนเต็ม — null ถ้ายังไม่มีคำตอบ */
export function accuracyPct(correct: number, answers: number): number | null {
  return answers > 0 ? Math.round((correct / answers) * 100) : null;
}

export type AccuracyTone = "good" | "warn" | "bad" | "none";

// เกณฑ์สีเดียวกันทั้งหน้า: ≥75 ดี, 50–74 พอใช้, <50 ควรทบทวน
export function accuracyTone(pct: number | null): AccuracyTone {
  if (pct === null) return "none";
  if (pct >= 75) return "good";
  if (pct >= 50) return "warn";
  return "bad";
}

export const TONE_TEXT: Record<AccuracyTone, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-red",
  none: "text-text3",
};

export const TONE_BG: Record<AccuracyTone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-red",
  none: "bg-border",
};

const BKK = "Asia/Bangkok";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: BKK });
const timeFmt = new Intl.DateTimeFormat("th-TH", { timeZone: BKK, hour: "2-digit", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("th-TH", { timeZone: BKK, day: "numeric", month: "short" });

/** "วันนี้ 09:10" / "เมื่อวาน 13:20" / "23 ก.ย. 16:26" (เวลาไทย) */
export function formatSessionTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const today = dayKey.format(now);
  const yesterday = dayKey.format(new Date(now.getTime() - 86_400_000));
  const key = dayKey.format(d);
  const prefix = key === today ? "วันนี้" : key === yesterday ? "เมื่อวาน" : dateFmt.format(d);
  return `${prefix} ${timeFmt.format(d)}`;
}

/** "วันนี้" / "เมื่อวาน" / "3 วันก่อน" / "23 ก.ย." */
export function formatRelativeDay(iso: string, now: Date): string {
  const days = Math.round(
    (Date.parse(dayKey.format(now)) - Date.parse(dayKey.format(new Date(iso)))) / 86_400_000
  );
  if (days <= 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  if (days < 7) return `${days} วันก่อน`;
  return dateFmt.format(new Date(iso));
}

export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m.toLocaleString("th-TH");
}

// ชิปผลกิจกรรมของคาบ (ใช้ทั้งหน้าแรกและหน้าห้อง)
export type ActivityChip = { label: string; tone: AccuracyTone | "neutral" };

export function sessionChips(s: SessionSummary): ActivityChip[] {
  const chips: ActivityChip[] = [];
  for (const r of s.raids) {
    const pct = accuracyPct(r.correct, r.answers);
    const outcome = r.result === "win" ? "ชนะ" : r.result === "lose" ? "แพ้" : r.status === "ended" ? "จบ" : "กำลังเล่น";
    chips.push({
      label: `Boss Raid ${outcome}${pct !== null ? ` · ถูก ${pct}%` : ""}`,
      tone: r.result === "win" ? "good" : r.result === "lose" ? "bad" : "neutral",
    });
  }
  for (const f of s.focus) {
    chips.push({ label: f.running ? "คาบตั้งใจ · กำลังดำเนิน" : `คาบตั้งใจ ${f.minutes} นาที`, tone: "neutral" });
  }
  if (s.picks > 0) chips.push({ label: `สุ่มตอบ ${s.picks} ครั้ง`, tone: "neutral" });
  return chips;
}

export const CHIP_CLASS: Record<ActivityChip["tone"], string> = {
  good: "bg-good/15 text-good",
  warn: "bg-warn/15 text-warn",
  bad: "bg-red/15 text-red",
  none: "bg-track text-text2",
  neutral: "bg-track text-text2",
};

// "ควรดูแล": ตอบ Raid ≥ 5 ข้อแต่ถูก < 50% หรือเข้าเรียนไม่ถึงครึ่ง (เมื่อห้องมี ≥ 3 คาบ)
export function needsAttention(s: ClassStudent, totalSessions: number): string | null {
  const pct = accuracyPct(s.raid_correct, s.raid_answers);
  if (s.raid_answers >= 5 && pct !== null && pct < 50) return `ตอบถูก ${pct}%`;
  if (totalSessions >= 3 && s.attended / totalSessions < 0.5) return `เข้า ${s.attended}/${totalSessions} คาบ`;
  return null;
}
