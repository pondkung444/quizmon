export const ANALYTICS_BANDS = ["primary", "junior", "senior", "unknown"] as const;
export type AnalyticsBand = (typeof ANALYTICS_BANDS)[number];
export const BAND_LABELS: Record<AnalyticsBand, string> = {
  primary: "ประถม", junior: "ม.ต้น", senior: "ม.ปลาย", unknown: "ไม่ระบุช่วงชั้น",
};
export const EXCLUDED_TEST_USERNAMES = new Set(["Dawu", "PonDKunG", "Gunzu", "Phase6 Verify"]);
export const MIN_LESSON_ATTEMPTS = 20;
export const MIN_LESSON_STUDENTS = 3;

export type AnalyticsProfile = {
  id: string; username: string | null; grade_band: string | null;
  school: string | null; grade_level: string | null;
};
export type AnalyticsAttempt = {
  user_id: string | null; is_correct: boolean; created_at: string;
  question_id: number | null; source: string | null;
};
export type AnalyticsQuestion = { id: number; category: string; grade_band: string | null };
const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });

export function analyticsBand(value: unknown): AnalyticsBand {
  return value === "primary" || value === "junior" || value === "senior" ? value : "unknown";
}
export function bangkokDateKey(value: string | number): string {
  return DATE_KEY_FORMATTER.format(new Date(value));
}
export function analyticsWindow(now: number) {
  const today = bangkokDateKey(now);
  const todayMs = new Date(`${today}T00:00:00+07:00`).getTime();
  return { todayMs, summaryMs: todayMs - 6 * 86400000, detailMs: todayMs - 13 * 86400000, now };
}
export function eligibleProfiles(profiles: AnalyticsProfile[], excludedIds: Set<string>) {
  return profiles.filter((p) => !excludedIds.has(p.id) && !EXCLUDED_TEST_USERNAMES.has(p.username?.trim() ?? ""));
}
type Counts = { users: Set<string>; attempts: number; correct: number };
function counts(): Counts { return { users: new Set(), attempts: 0, correct: 0 }; }
function add(target: Counts, attempt: AnalyticsAttempt) {
  target.users.add(attempt.user_id!);
  target.attempts++;
  if (attempt.is_correct) target.correct++;
}
function metric(target: Counts) {
  return {
    students: target.users.size, attempts: target.attempts,
    accuracyPct: target.attempts ? target.correct / target.attempts * 100 : null,
  };
}
const MODE_LABELS: Record<string, string> = {
  topic_select: "เลือกบทเรียน", mission: "ภารกิจ", dungeon_bonus: "Dungeon",
  raid_boss: "Raid Boss", pvp: "PvP", unknown: "ไม่ระบุโหมด (ข้อมูลเดิม)",
};
export function aggregateAnalytics(
  profiles: AnalyticsProfile[], attempts: AnalyticsAttempt[], questions: AnalyticsQuestion[], now: number,
) {
  const window = analyticsWindow(now);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const summary = counts();
  const today = counts();
  const daysByUser = new Map<string, Set<string>>();
  const byBand = new Map(ANALYTICS_BANDS.map((band) => [band, counts()]));
  const byMode = new Map<string, Counts>();
  const byDay = new Map<string, Counts>();
  const byLesson = new Map<string, Counts & { category: string; band: AnalyticsBand }>();
  let unmappedAttempts = 0;
  for (const attempt of attempts) {
    const ts = new Date(attempt.created_at).getTime();
    if (!attempt.user_id || !profileById.has(attempt.user_id) || !Number.isFinite(ts) || ts < window.detailMs || ts > now) continue;
    const dayKey = bangkokDateKey(ts);
    if (!byDay.has(dayKey)) byDay.set(dayKey, counts());
    add(byDay.get(dayKey)!, attempt);
    const question = attempt.question_id == null ? undefined : questionById.get(attempt.question_id);
    if (question) {
      const band = analyticsBand(question.grade_band);
      // Join by question_id: the same category name can exist in multiple grade bands.
      const key = JSON.stringify([band, question.category]);
      if (!byLesson.has(key)) byLesson.set(key, { ...counts(), category: question.category, band });
      add(byLesson.get(key)!, attempt);
    } else unmappedAttempts++;
    if (ts < window.summaryMs) continue;
    add(summary, attempt);
    if (ts >= window.todayMs) add(today, attempt);
    add(byBand.get(analyticsBand(profileById.get(attempt.user_id)!.grade_band))!, attempt);
    const mode = attempt.source || "unknown";
    if (!byMode.has(mode)) byMode.set(mode, counts());
    add(byMode.get(mode)!, attempt);
    if (!daysByUser.has(attempt.user_id)) daysByUser.set(attempt.user_id, new Set());
    daysByUser.get(attempt.user_id)!.add(dayKey);
  }
  const repeatStudents = [...daysByUser.values()].filter((days) => days.size >= 2).length;
  const summaryMetric = metric(summary);
  const bands = ANALYTICS_BANDS.map((band) => ({
    band, label: BAND_LABELS[band], ...metric(byBand.get(band)!),
    registered: profiles.filter((p) => analyticsBand(p.grade_band) === band).length,
  }));
  const modes = [...byMode].map(([key, value]) => ({ key, label: Object.hasOwn(MODE_LABELS, key) ? MODE_LABELS[key] : key, ...metric(value) }))
    .sort((a, b) => b.attempts - a.attempts);
  const lessons = [...byLesson.values()].map((value) => ({
    ...metric(value), category: value.category, band: value.band,
    reliable: value.attempts >= MIN_LESSON_ATTEMPTS && value.users.size >= MIN_LESSON_STUDENTS,
  })).sort((a, b) => Number(b.reliable) - Number(a.reliable) || (a.accuracyPct ?? 100) - (b.accuracyPct ?? 100) || b.attempts - a.attempts);
  const questionsPerDay = Array.from({ length: 14 }, (_, i) => {
    const ts = window.detailMs + i * 86400000;
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(new Date(ts));
    const value = byDay.get(bangkokDateKey(ts)) ?? counts();
    return {
      dateLabel: new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(new Date(ts)),
      total: value.attempts, activeUsers: value.users.size, isWeekend: weekday === "Sat" || weekday === "Sun",
    };
  });
  return {
    summary: summaryMetric, today: metric(today), registered: profiles.length,
    repeatStudents, repeatPct: summaryMetric.students ? repeatStudents / summaryMetric.students * 100 : null,
    averageQuestions: summaryMetric.students ? summaryMetric.attempts / summaryMetric.students : null,
    bands, modes, lessons, questionsPerDay, unmappedAttempts,
  };
}
export type AnalyticsDashboardData = ReturnType<typeof aggregateAnalytics>;
