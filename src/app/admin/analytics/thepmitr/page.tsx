import { redirect } from "next/navigation";
import { Crown } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeeklyLeaderboardTopN, type LeaderboardEntry } from "@/lib/weeklyLeaderboard";
import StatTile from "@/components/admin/StatTile";
import QuestionsPerDayChart, { type QuestionsPerDayDatum } from "@/components/admin/QuestionsPerDayChart";
import GradeLevelFilterSelect, { type GradeLevelOption } from "@/components/admin/GradeLevelFilterSelect";
import HardestLessonsCard, { type HardestLessonRow } from "@/components/admin/HardestLessonsCard";

const SUMMARY_WINDOW_DAYS = 7;
const DETAIL_WINDOW_DAYS = 14;
const MIN_ATTEMPTS_FOR_ACCURACY = 20;
// กันตีความเกินจากข้อมูลน้อยในตาราง struggle segmentation (นักเรียนตอบน้อยเกินจะสรุปพฤติกรรมไม่ได้)
const MIN_ATTEMPTS_FOR_STRUGGLE = 10;
const AT_RISK_ROWS_PER_BAND = 15;

const SCHOOL_NAME = "เทพมิตรศึกษา";
const GRADE_LEVELS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"] as const;

type Band = "junior" | "senior";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function nowMsFn(): number {
  return Date.now();
}

function bkkDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(iso));
}

function bkkWeekdayIndex(iso: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(new Date(iso));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
}

function formatDurationTh(totalSec: number): string {
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  if (min === 0) return `${sec} วินาที`;
  return `${min} นาที ${sec} วินาที`;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gold-dim bg-card p-5">
      <h2 className="text-sm font-bold text-gold-hi">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-text3">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

type AnalyticsEventRow = {
  user_id: string | null;
  event_name: string;
  screen: string | null;
  props: Record<string, unknown> | null;
  session_id: string;
  client_ts: string;
};

// PostgREST ตัดผลลัพธ์ที่ 1000 แถวต่อ request แบบเงียบๆ — query แบบเดิม (ยิงตรงไม่ paginate)
// โดน cap โดยไม่รู้ตัว ทำให้ทั้งช้า (ยิง 6 query ที่เนื้อหาซ้อนกันเอง) และตัวเลขต่ำกว่าจริง
// ดึงก้อนเดียวครบทุก event ในหน้าต่างเวลา แล้วให้ผู้เรียกแตก subset ใน JS แทน
async function fetchAllEventsSince(
  admin: ReturnType<typeof createAdminClient>,
  sinceIso: string
): Promise<AnalyticsEventRow[]> {
  const PAGE_SIZE = 1000;
  const rows: AnalyticsEventRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("analytics_events")
      .select("user_id, event_name, screen, props, session_id, client_ts")
      .gte("client_ts", sinceIso)
      .order("client_ts", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as AnalyticsEventRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// category -> grade_band map: `questions` มี 3,354+ แถว เกิน cap 1,000 ของ PostgREST
// ต้อง paginate + ใส่ .order() ให้ลำดับ deterministic ไม่งั้นชุดที่หายจะสลับเองหลัง VACUUM
async function fetchAllQuestionCategoryBands(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ category: string; grade_band: Band }[]> {
  const PAGE_SIZE = 1000;
  const rows: { category: string; grade_band: Band }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("questions")
      .select("category, grade_band")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as { category: string; grade_band: Band }[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

type QuizAttemptRow = { user_id: string | null; is_correct: boolean; created_at: string };

// quiz_attempts insert server-side ทุกครั้งที่ตอบ (ไม่ต้อง client fire เหมือน analytics_events)
// และไม่มี admin-filter asymmetry — แม่นกว่าสำหรับ active-today / at-risk
// เกิน 1000 แถว (all-time ~3,300) ต้อง paginate เหมือน fetchAllEventsSince ไม่งั้นโดน cap เงียบๆ
async function fetchAllAttempts(admin: ReturnType<typeof createAdminClient>): Promise<QuizAttemptRow[]> {
  const PAGE_SIZE = 1000;
  const rows: QuizAttemptRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("quiz_attempts")
      .select("user_id, is_correct, created_at")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as QuizAttemptRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export default async function ThepmitrAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // gate ซ้ำอีกชั้นในหน้า นอกจาก middleware (src/lib/supabase/middleware.ts) — กันกรณี
  // middleware ถูก bypass หรือถูกแก้ในอนาคตแล้วลืมทดสอบ /admin/analytics/thepmitr
  // ใช้ ANALYTICS_ADMIN_EMAILS แยกจาก ADMIN_EMAILS เดิม (หน้านี้ไม่ใช่แอดมินระบบทั่วไป)
  const user = await getUser();

  // ยังคง ADMIN_EMAILS ไว้เพื่อ exclude แอดมินระบบออกจากสถิติระยะเวลาเซสชันเหมือนหน้า analytics เดิม
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const analyticsAdminEmails = (process.env.ANALYTICS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const userEmail = user?.email?.toLowerCase();
  if (!userEmail || !analyticsAdminEmails.includes(userEmail)) {
    redirect("/");
  }

  const { grade } = await searchParams;
  const gradeParam =
    typeof grade === "string" && (GRADE_LEVELS as readonly string[]).includes(grade) ? grade : undefined;

  const admin = createAdminClient();

  const [usersListRes, allEvents, allAttempts, profsRes, questionCategoryBands] = await Promise.all([
    // exclude แอดมินเองออกจากสถิติระยะเวลาเซสชัน (ไม่งั้นแอดมินเข้าดู dashboard เองจะปนเข้าสถิติ)
    admin.auth.admin.listUsers({ perPage: 1000 }),
    // ทุก subset ที่หน้านี้ใช้ (summary 7 วัน / question_answer 14 วัน) เป็น subset ของ
    // "ทุก event 14 วัน" ก้อนเดียว
    fetchAllEventsSince(admin, isoDaysAgo(DETAIL_WINDOW_DAYS)),
    // active-today + at-risk list: มาจาก quiz_attempts ตรงๆ (server-side insert ทุกครั้ง แม่นกว่า analytics_events)
    fetchAllAttempts(admin),
    admin.from("profiles").select("id, username, grade_band, grade_level, school"),
    // ใช้สร้าง category -> grade_band map (question_answer event props มีแค่ category/subject
    // ไม่มี grade_band ตรงๆ — survey แล้วพบว่า category ไม่ซ้ำข้ามกลุ่มเลย จึง join ทาง category ได้)
    fetchAllQuestionCategoryBands(admin),
  ]);

  const adminUserIds = new Set(
    (usersListRes.data?.users ?? [])
      .filter((u) => u.email && adminEmails.includes(u.email.toLowerCase()))
      .map((u) => u.id)
  );

  const nameById = new Map(
    (profsRes.data ?? []).map((p) => [p.id as string, ((p.username as string | null) ?? "").trim() || "(ไม่มีชื่อ)"])
  );
  const bandById = new Map(
    (profsRes.data ?? []).map((p) => [p.id as string, (p.grade_band as Band | null) ?? null])
  );
  const bandLabel = (band: Band | null) => (band === "senior" ? "ม.ปลาย" : band === "junior" ? "ม.ต้น" : "-");

  // ตัวทดสอบ — ไม่นับรวมในสถิติ
  const EXCLUDED_TEST_USERNAMES = new Set(["Dawu", "PonDKunG", "Gunzu", "Phase6 Verify"]);
  const excludedUserIds = new Set(
    Array.from(nameById.entries())
      .filter(([, name]) => EXCLUDED_TEST_USERNAMES.has(name))
      .map(([id]) => id)
  );

  const categoryToBand = new Map<string, Band>();
  for (const q of questionCategoryBands) {
    categoryToBand.set(q.category, q.grade_band);
  }

  // ============================================================
  // Grade level filter — หน้านี้ล็อกให้เห็นแค่ข้อมูลของ SCHOOL_NAME เท่านั้น
  // (schoolProfiles กรองจาก school ก่อน แล้วนับจำนวนต่อ grade_level มาทำ dropdown)
  // ============================================================
  const schoolProfiles = (profsRes.data ?? []).filter((p) => p.school === SCHOOL_NAME);
  const gradeLevelCounts = new Map<string, number>();
  for (const p of schoolProfiles) {
    const g = p.grade_level as string | null;
    if (!g) continue;
    gradeLevelCounts.set(g, (gradeLevelCounts.get(g) ?? 0) + 1);
  }
  const gradeLevelOptions: GradeLevelOption[] = [
    { value: "", label: `ทุกระดับชั้น (${schoolProfiles.length})` },
    ...GRADE_LEVELS.map((g) => ({ value: g, label: `${g} (${gradeLevelCounts.get(g) ?? 0})` })),
  ];

  const schoolFilteredUserIds = new Set(
    schoolProfiles
      .filter((p) => gradeParam === undefined || p.grade_level === gradeParam)
      .map((p) => p.id as string)
  );
  function passesSchoolFilter(userId: string | null): boolean {
    if (!userId) return false;
    return schoolFilteredUserIds.has(userId);
  }

  const [weeklyLeaderboardJunior, weeklyLeaderboardSenior] = await Promise.all([
    getWeeklyLeaderboardTopN(admin, 10, "junior", schoolFilteredUserIds),
    getWeeklyLeaderboardTopN(admin, 10, "senior", schoolFilteredUserIds),
  ]);

  // เทียบเวลาเป็น ms เสมอ — client_ts จาก DB อาจลงท้าย "+00:00" ส่วน isoDaysAgo ลงท้าย "Z"
  // เทียบ string ตรงๆ ไม่ได้
  const nowMs = nowMsFn();
  const summaryCutoffMs = new Date(isoDaysAgo(SUMMARY_WINDOW_DAYS)).getTime();
  const summaryEvents = allEvents.filter((e) => new Date(e.client_ts).getTime() >= summaryCutoffMs);
  const detailAnswers = allEvents.filter((e) => e.event_name === "question_answer");

  // ============================================================
  // บล็อก 1: แถบสรุป (7 วัน) — เพิ่ม breakdown junior/senior ในวงเล็บ
  // ============================================================
  const activeUserIds = new Set<string>();
  const activeUserIdsByBand: Record<Band, Set<string>> = { junior: new Set(), senior: new Set() };
  const userDayPairs = new Set<string>();
  const userDaySets = new Map<string, Set<string>>();
  let sessionStartCount = 0;
  let answerCount7d = 0;
  let answerCorrect7d = 0;
  const answerCountByBand: Record<Band, number> = { junior: 0, senior: 0 };
  const answerCorrectByBand: Record<Band, number> = { junior: 0, senior: 0 };

  for (const e of summaryEvents) {
    if (!e.user_id || !passesSchoolFilter(e.user_id)) continue;
    const dateKey = bkkDateKey(e.client_ts);
    activeUserIds.add(e.user_id);
    const band = bandById.get(e.user_id);
    if (band) activeUserIdsByBand[band].add(e.user_id);
    userDayPairs.add(`${e.user_id}|${dateKey}`);
    if (!userDaySets.has(e.user_id)) userDaySets.set(e.user_id, new Set());
    userDaySets.get(e.user_id)!.add(dateKey);
    if (e.event_name === "session_start") sessionStartCount++;
    if (e.event_name === "question_answer") {
      answerCount7d++;
      const isCorrect = !!e.props?.is_correct;
      if (isCorrect) answerCorrect7d++;
      if (band) {
        answerCountByBand[band]++;
        if (isCorrect) answerCorrectByBand[band]++;
      }
    }
  }

  const activeUsers7d = activeUserIds.size;
  const avgSessionsPerUserPerDay = userDayPairs.size > 0 ? sessionStartCount / userDayPairs.size : 0;
  const avgAccuracyPct = answerCount7d > 0 ? (answerCorrect7d / answerCount7d) * 100 : 0;
  const avgAccuracyPctByBand: Record<Band, number> = {
    junior: answerCountByBand.junior > 0 ? (answerCorrectByBand.junior / answerCountByBand.junior) * 100 : 0,
    senior: answerCountByBand.senior > 0 ? (answerCorrectByBand.senior / answerCountByBand.senior) * 100 : 0,
  };

  let returningUsers = 0;
  for (const days of userDaySets.values()) {
    if (days.size >= 2) returningUsers++;
  }
  const returnRatePct = activeUsers7d > 0 ? (returningUsers / activeUsers7d) * 100 : 0;

  const bandBreakdown = (byBand: Record<Band, number>) => `(ม.ต้น ${byBand.junior.toLocaleString("th-TH")} · ม.ปลาย ${byBand.senior.toLocaleString("th-TH")})`;
  const bandBreakdownPct = (byBand: Record<Band, number>) => `(ม.ต้น ${byBand.junior.toFixed(0)}% · ม.ปลาย ${byBand.senior.toFixed(0)}%)`;

  // ============================================================
  // บล็อก 1b: Active วันนี้ + at-risk source data (จาก quiz_attempts ตรงๆ, all-time)
  // ============================================================
  const todayBkkDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const todayCutoffMs = new Date(`${todayBkkDateStr}T00:00:00+07:00`).getTime();

  const activeTodayIds = new Set<string>();
  const activeTodayIdsByBand: Record<Band, Set<string>> = { junior: new Set(), senior: new Set() };
  const lastAttemptByUser = new Map<string, number>();
  const totalAttemptsByUser = new Map<string, number>();

  for (const r of allAttempts) {
    if (!r.user_id || excludedUserIds.has(r.user_id) || !passesSchoolFilter(r.user_id)) continue;
    const ts = new Date(r.created_at).getTime();
    if (ts >= todayCutoffMs) {
      activeTodayIds.add(r.user_id);
      const band = bandById.get(r.user_id);
      if (band) activeTodayIdsByBand[band].add(r.user_id);
    }
    lastAttemptByUser.set(r.user_id, Math.max(lastAttemptByUser.get(r.user_id) ?? 0, ts));
    totalAttemptsByUser.set(r.user_id, (totalAttemptsByUser.get(r.user_id) ?? 0) + 1);
  }
  const activeToday = activeTodayIds.size;

  // ============================================================
  // เพิ่มใหม่ — รายชื่อ "กำลังจะหลุด": เคยเล่นมาก่อนแต่ไม่มี attempt ใน SUMMARY_WINDOW_DAYS วันล่าสุด
  // แยก junior/senior เพราะ pool senior เล็กมาก นิยาม "หาย" ไม่ควรปนกับ junior
  // ============================================================
  const atRiskAll = Array.from(lastAttemptByUser.entries())
    .filter(([, lastTs]) => lastTs < summaryCutoffMs)
    .map(([uid, lastTs]) => ({
      name: nameById.get(uid) ?? "(ไม่ทราบ)",
      band: bandById.get(uid) ?? null,
      daysSinceLastPlay: Math.floor((nowMs - lastTs) / (24 * 60 * 60 * 1000)),
      totalAttempts: totalAttemptsByUser.get(uid) ?? 0,
    }))
    .sort((a, b) => b.daysSinceLastPlay - a.daysSinceLastPlay);

  const atRiskJunior = atRiskAll.filter((u) => u.band === "junior").slice(0, AT_RISK_ROWS_PER_BAND);
  const atRiskSenior = atRiskAll.filter((u) => u.band === "senior").slice(0, AT_RISK_ROWS_PER_BAND);

  // ============================================================
  // บล็อก 2: คำถามต่อวัน (14 วัน, รวม/เฉลี่ยต่อคน สลับได้ที่ client)
  // ============================================================
  const byDay = new Map<string, { total: number; users: Set<string> }>();
  for (const e of detailAnswers) {
    if (!passesSchoolFilter(e.user_id)) continue;
    const dateKey = bkkDateKey(e.client_ts);
    if (!byDay.has(dateKey)) byDay.set(dateKey, { total: 0, users: new Set() });
    const agg = byDay.get(dateKey)!;
    agg.total++;
    if (e.user_id) agg.users.add(e.user_id);
  }

  const questionsPerDay: QuestionsPerDayDatum[] = [];
  for (let i = DETAIL_WINDOW_DAYS - 1; i >= 0; i--) {
    const iso = isoDaysAgo(i);
    const dateKey = bkkDateKey(iso);
    const agg = byDay.get(dateKey);
    const weekday = bkkWeekdayIndex(iso);
    questionsPerDay.push({
      dateLabel: new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(
        new Date(iso)
      ),
      total: agg?.total ?? 0,
      activeUsers: agg?.users.size ?? 0,
      isWeekend: weekday === 0 || weekday === 6,
    });
  }

  // ============================================================
  // เพิ่มใหม่ — Struggle segmentation: แยกนักเรียนตาม time_used_ms ของ question_answer 14 วัน
  // (ไม่เข้าใจ = ผิด+ใช้เวลานาน, มั่ว = ผิด+เร็วมาก, แม่นจริง = ถูก+เร็วมาก — ใช้แค่ 2 กลุ่มแรกในตาราง)
  // ============================================================
  type StruggleBucket = "confused" | "guessing" | "mastered";
  const perUserStruggle = new Map<string, Record<StruggleBucket, number>>();
  const totalAnsweredByUser14d = new Map<string, number>();
  for (const e of detailAnswers) {
    if (!e.user_id || excludedUserIds.has(e.user_id) || !passesSchoolFilter(e.user_id)) continue;
    totalAnsweredByUser14d.set(e.user_id, (totalAnsweredByUser14d.get(e.user_id) ?? 0) + 1);
    const timeMs = e.props?.time_used_ms as number | undefined;
    const isCorrect = !!e.props?.is_correct;
    if (typeof timeMs !== "number") continue;
    let bucket: StruggleBucket | null = null;
    if (!isCorrect && timeMs > 30000) bucket = "confused";
    else if (!isCorrect && timeMs < 2000) bucket = "guessing";
    else if (isCorrect && timeMs < 2000) bucket = "mastered";
    if (!bucket) continue;
    if (!perUserStruggle.has(e.user_id)) {
      perUserStruggle.set(e.user_id, { confused: 0, guessing: 0, mastered: 0 });
    }
    perUserStruggle.get(e.user_id)![bucket]++;
  }

  const strugglingStudents = Array.from(perUserStruggle.entries())
    .filter(([uid]) => (totalAnsweredByUser14d.get(uid) ?? 0) >= MIN_ATTEMPTS_FOR_STRUGGLE)
    .map(([uid, b]) => ({
      name: nameById.get(uid) ?? "(ไม่ทราบ)",
      band: bandById.get(uid) ?? null,
      confused: b.confused,
      guessing: b.guessing,
    }))
    .sort((a, b) => b.confused - a.confused)
    .slice(0, 15);

  // ============================================================
  // บล็อก 6: บทเรียนยากสุด (จาก dataset เดียวกับบล็อก 2 — question_answer 14 วัน)
  // แยก all/junior/senior ล่วงหน้าฝั่ง server ผ่าน categoryToBand (category ไม่ซ้ำข้ามกลุ่ม)
  // ============================================================
  const byCategory = new Map<string, { count: number; correct: number; totalTimeMs: number }>();
  for (const e of detailAnswers) {
    if (!passesSchoolFilter(e.user_id)) continue;
    const category = (e.props?.category as string | undefined) ?? "ไม่ทราบหมวด";
    if (!byCategory.has(category)) byCategory.set(category, { count: 0, correct: 0, totalTimeMs: 0 });
    const agg = byCategory.get(category)!;
    agg.count++;
    if (e.props?.is_correct) agg.correct++;
    if (typeof e.props?.time_used_ms === "number") agg.totalTimeMs += e.props.time_used_ms as number;
  }
  const hardestLessonsAll: HardestLessonRow[] = Array.from(byCategory.entries())
    .map(([category, agg]) => ({
      category,
      count: agg.count,
      accuracyPct: agg.count > 0 ? (agg.correct / agg.count) * 100 : 0,
      avgTimeSec: agg.count > 0 ? agg.totalTimeMs / agg.count / 1000 : 0,
    }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct);
  const hardestLessonsJunior = hardestLessonsAll.filter((r) => categoryToBand.get(r.category) === "junior");
  const hardestLessonsSenior = hardestLessonsAll.filter((r) => categoryToBand.get(r.category) === "senior");

  // ============================================================
  // บล็อก 7: ระยะเวลาเซสชันเฉลี่ย — ต่อ session_id หา max(client_ts)-min(client_ts)
  // (exclude แอดมิน, session ที่มี event เดียว duration=0 นับรวมด้วยไม่ filter ทิ้ง)
  // ============================================================
  // เก็บแค่ min/max ต่อ session พอ ไม่ต้องสะสม timestamp ทุกตัวไว้ (Math.min(...array) spread
  // array ยาวๆ เสี่ยง stack overflow เมื่อ session มี event เยอะ)
  const sessionTsMap = new Map<string, { min: number; max: number }>();
  for (const e of allEvents) {
    if (e.user_id && adminUserIds.has(e.user_id)) continue;
    if (!passesSchoolFilter(e.user_id)) continue;
    const ts = new Date(e.client_ts).getTime();
    const range = sessionTsMap.get(e.session_id);
    if (!range) {
      sessionTsMap.set(e.session_id, { min: ts, max: ts });
    } else {
      if (ts < range.min) range.min = ts;
      if (ts > range.max) range.max = ts;
    }
  }

  let totalSessionDurationSec = 0;
  let sessionCount = 0;
  for (const { min: minTs, max: maxTs } of sessionTsMap.values()) {
    totalSessionDurationSec += (maxTs - minTs) / 1000;
    sessionCount++;
  }
  const avgSessionDurationSec = sessionCount > 0 ? totalSessionDurationSec / sessionCount : 0;

  // phase 3 (แผนแยก junior/senior): ตาราง Weekly Leaderboard แยกเป็น 2 กลุ่มจริง — ใช้ bandLabel
  // เดิมด้านบนทั้ง heading และ empty state กันข้อความไม่ตรงกับ 2 ตาราง
  function renderWeeklyLeaderboardTable(rows: LeaderboardEntry[], band: Band) {
    if (rows.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-text3">
          ยังไม่มีข้อมูลกลุ่ม {bandLabel(band)} ในสัปดาห์นี้
        </p>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text3">
              <th className="py-2 pr-3 font-medium">อันดับ</th>
              <th className="py-2 pr-3 font-medium">ชื่อ</th>
              <th className="py-2 pr-3 font-medium text-right">แต้ม</th>
              <th className="py-2 pr-3 font-medium text-right">ความแม่น</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.rnk}-${row.username}`} className="border-b border-border/50">
                <td className={`py-2 pr-3 ${row.rnk === 1 ? "font-bold text-gold-hi" : "text-text"}`}>
                  <span className="inline-flex items-center gap-1">
                    {row.rnk === 1 && <Crown size={14} className="text-gold" />}
                    {row.rnk}
                  </span>
                </td>
                <td className={`py-2 pr-3 ${row.rnk === 1 ? "font-bold text-gold-hi" : "text-text"}`}>
                  {row.username}
                </td>
                <td className="py-2 pr-3 text-right text-text2">{row.total_points.toLocaleString("th-TH")}</td>
                <td className="py-2 pr-3 text-right text-text3">{row.accuracy.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderAtRiskTable(rows: typeof atRiskJunior, band: Band) {
    if (rows.length === 0) {
      return (
        <p className="py-6 text-center text-sm text-text3">ไม่มีนักเรียนกลุ่ม {bandLabel(band)} ที่หายไปตอนนี้</p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text3">
              <th className="py-2 pr-3 font-medium">ชื่อ</th>
              <th className="py-2 pr-3 font-medium text-right">หายไป (วัน)</th>
              <th className="py-2 pr-3 font-medium text-right">ข้อสะสมทั้งหมด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border/50">
                <td className="py-2 pr-3 text-text">{row.name}</td>
                <td className="py-2 pr-3 text-right font-bold text-red">{row.daysSinceLastPlay}</td>
                <td className="py-2 pr-3 text-right text-text2">{row.totalAttempts.toLocaleString("th-TH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gold-hi">Analytics</h1>
          <p className="text-sm text-text3">ข้อมูลการเล่นของนักเรียนโรงเรียน{SCHOOL_NAME}</p>
        </div>
        <GradeLevelFilterSelect options={gradeLevelOptions} />
      </div>

      {/* บล็อก 1: แถบสรุป */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatTile
          label={`Active users (${SUMMARY_WINDOW_DAYS} วัน)`}
          value={activeUsers7d.toLocaleString("th-TH")}
          sublabel={bandBreakdown(
            Object.fromEntries(
              (["junior", "senior"] as Band[]).map((b) => [b, activeUserIdsByBand[b].size])
            ) as Record<Band, number>
          )}
        />
        <StatTile
          label="Active วันนี้"
          value={activeToday.toLocaleString("th-TH")}
          sublabel={bandBreakdown(
            Object.fromEntries(
              (["junior", "senior"] as Band[]).map((b) => [b, activeTodayIdsByBand[b].size])
            ) as Record<Band, number>
          )}
        />
        <StatTile
          label="Session เฉลี่ย/คน/วัน"
          value={avgSessionsPerUserPerDay.toFixed(1)}
          sublabel="เฉพาะวันที่มีกิจกรรมจริง"
        />
        <StatTile
          label="ตอบคำถามรวม"
          value={answerCount7d.toLocaleString("th-TH")}
          sublabel={bandBreakdown(answerCountByBand)}
        />
        <StatTile
          label="ความแม่นเฉลี่ย"
          value={`${avgAccuracyPct.toFixed(0)}%`}
          sublabel={bandBreakdownPct(avgAccuracyPctByBand)}
        />
        <StatTile
          label="ระยะเวลาเซสชันเฉลี่ย"
          value={formatDurationTh(avgSessionDurationSec)}
          sublabel={`${sessionCount.toLocaleString("th-TH")} session (${DETAIL_WINDOW_DAYS} วัน, ไม่รวมแอดมิน)`}
        />
      </div>

      {/* Weekly Leaderboard — แยก junior/senior จริง (pool คำนวณแยกกันฝั่ง SQL ผ่าน
          weekly_scores_bkk(p_grade_band)) กรองตาม grade filter ก่อน rank เสมอ */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard
          title={`Weekly Leaderboard · ${bandLabel("junior")}`}
          subtitle="Top 10 สัปดาห์นี้ (จ-อา) — สูตรแต้มเดียวกับที่โชว์ผู้เล่นใน /pet"
        >
          {renderWeeklyLeaderboardTable(weeklyLeaderboardJunior, "junior")}
        </ChartCard>

        <ChartCard
          title={`Weekly Leaderboard · ${bandLabel("senior")}`}
          subtitle="Top 10 สัปดาห์นี้ (จ-อา) — สูตรแต้มเดียวกับที่โชว์ผู้เล่นใน /pet"
        >
          {renderWeeklyLeaderboardTable(weeklyLeaderboardSenior, "senior")}
        </ChartCard>
      </div>

      {/* บล็อก 2: คำถามต่อวัน */}
      <ChartCard title="คำถามต่อวัน" subtitle={`${DETAIL_WINDOW_DAYS} วันล่าสุด`}>
        <QuestionsPerDayChart data={questionsPerDay} />
      </ChartCard>

      {/* เพิ่มใหม่ — struggle segmentation */}
      <ChartCard
        title="นักเรียนที่น่าจะยังไม่เข้าใจ"
        subtitle={`ไม่เข้าใจ = ตอบผิด+ใช้เวลานาน · มั่ว = ตอบผิด+เร็วมาก (${DETAIL_WINDOW_DAYS} วัน, ตอบอย่างน้อย ${MIN_ATTEMPTS_FOR_STRUGGLE} ข้อ)`}
      >
        {strugglingStudents.length === 0 ? (
          <p className="py-8 text-center text-sm text-text3">ยังไม่มีข้อมูลพอ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text3">
                  <th className="py-2 pr-3 font-medium">ชื่อ</th>
                  <th className="py-2 pr-3 font-medium">ระดับชั้น</th>
                  <th className="py-2 pr-3 font-medium text-right">ไม่เข้าใจ</th>
                  <th className="py-2 pr-3 font-medium text-right">มั่ว</th>
                </tr>
              </thead>
              <tbody>
                {strugglingStudents.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-text">{row.name}</td>
                    <td className="py-2 pr-3 text-text3">{bandLabel(row.band)}</td>
                    <td className="py-2 pr-3 text-right font-bold text-red">{row.confused}</td>
                    <td className="py-2 pr-3 text-right text-text2">{row.guessing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {/* บล็อก 6: บทเรียนยากสุด — toggle ทั้งหมด/ม.ต้น/ม.ปลาย + data-confidence badge */}
      <HardestLessonsCard
        all={hardestLessonsAll}
        junior={hardestLessonsJunior}
        senior={hardestLessonsSenior}
        minConfidence={MIN_ATTEMPTS_FOR_ACCURACY}
      />

      {/* กลับมาเลี้ยง + เพิ่มใหม่ กำลังจะหลุด — สองอย่างนี้เป็นเรื่อง retention เดียวกัน */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
        <ChartCard title="กลับมาเลี้ยง" subtitle={`% ที่เล่นซ้ำ >= 2 วันใน ${SUMMARY_WINDOW_DAYS} วันล่าสุด`}>
          <div className="flex h-full items-center justify-center py-6">
            <p className="text-5xl font-bold text-gold-hi">{returnRatePct.toFixed(0)}%</p>
          </div>
          <p className="text-center text-xs text-text3">
            {returningUsers.toLocaleString("th-TH")} / {activeUsers7d.toLocaleString("th-TH")} คน
          </p>
        </ChartCard>

        <ChartCard
          title="กำลังจะหลุด"
          subtitle={`เคยเล่นมาก่อนแต่ไม่มี attempt ใน ${SUMMARY_WINDOW_DAYS} วันล่าสุด (เรียงหายนานสุดก่อน)`}
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-xs font-medium text-text3">ม.ต้น</p>
              {renderAtRiskTable(atRiskJunior, "junior")}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-text3">ม.ปลาย</p>
              {renderAtRiskTable(atRiskSenior, "senior")}
            </div>
          </div>
        </ChartCard>
      </div>
    </main>
  );
}
