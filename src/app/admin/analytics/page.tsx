import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBLINE_LABEL } from "@/lib/labels";
import StatTile from "@/components/admin/StatTile";
import BarChartCard, { CHART_AMBER, CHART_INDIGO, CHART_RED } from "@/components/admin/BarChartCard";
import QuestionsPerDayChart, { type QuestionsPerDayDatum } from "@/components/admin/QuestionsPerDayChart";
import FunnelChartCard, { type FunnelStep } from "@/components/admin/FunnelChartCard";

const SUMMARY_WINDOW_DAYS = 7;
const DETAIL_WINDOW_DAYS = 14;
const MAX_SCREEN_GAP_MS = 30 * 60 * 1000; // ตัด outlier เวลาต่อหน้าจอที่เกิน 30 นาที (client_ts เพี้ยน/ปิดแอปค้าง)

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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

export default async function AdminAnalyticsPage() {
  // gate ซ้ำอีกชั้นในหน้า นอกจาก middleware (src/lib/supabase/middleware.ts) — กันกรณี
  // middleware ถูก bypass หรือถูกแก้ในอนาคตแล้วลืมทดสอบ /admin/*
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const userEmail = user?.email?.toLowerCase();
  if (!userEmail || !adminEmails.includes(userEmail)) {
    redirect("/");
  }

  const admin = createAdminClient();

  // exclude แอดมินเองออกจากสถิติระยะเวลาเซสชัน (ไม่งั้นแอดมินเข้าดู dashboard เองจะปนเข้าสถิติ)
  const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const adminUserIds = new Set(
    (usersList?.users ?? [])
      .filter((u) => u.email && adminEmails.includes(u.email.toLowerCase()))
      .map((u) => u.id)
  );

  const [
    summaryRes,
    detailAnswersRes,
    screenEventsRes,
    eggSelectedRes,
    comboClicksRes,
    eggTypesRes,
    sessionEventsRes,
    playerEggsRes,
    petsRes,
  ] = await Promise.all([
    admin
      .from("analytics_events")
      .select("user_id, event_name, props, session_id, client_ts")
      .gte("client_ts", isoDaysAgo(SUMMARY_WINDOW_DAYS)),
    admin
      .from("analytics_events")
      .select("user_id, event_name, props, session_id, client_ts")
      .eq("event_name", "question_answer")
      .gte("client_ts", isoDaysAgo(DETAIL_WINDOW_DAYS)),
    admin
      .from("analytics_events")
      .select("user_id, event_name, screen, props, session_id, client_ts")
      .in("event_name", ["screen_view", "session_end"])
      .gte("client_ts", isoDaysAgo(DETAIL_WINDOW_DAYS)),
    admin
      .from("analytics_events")
      .select("props")
      .eq("event_name", "egg_selected")
      .gte("client_ts", isoDaysAgo(DETAIL_WINDOW_DAYS)),
    admin
      .from("analytics_events")
      .select("props")
      .eq("event_name", "collection_slot_click")
      .gte("client_ts", isoDaysAgo(DETAIL_WINDOW_DAYS)),
    admin.from("egg_types").select("id, name_th"),
    // ระยะเวลาเซสชัน: ต้องได้ client_ts ของทุก event (ไม่จำกัด event_name) เพื่อหา max-min ต่อ session_id จริง
    admin
      .from("analytics_events")
      .select("user_id, session_id, client_ts")
      .gte("client_ts", isoDaysAgo(DETAIL_WINDOW_DAYS)),
    // egg funnel: นับทั้งหมด (all-time) ไม่ใช้ analytics_events เพราะข้อมูล player_eggs/pets แม่นกว่า
    admin.from("player_eggs").select("hatched_at, hatched_pet_id"),
    admin.from("pets").select("id, stage, is_active"),
  ]);

  const summaryEvents = (summaryRes.data ?? []) as AnalyticsEventRow[];
  const detailAnswers = (detailAnswersRes.data ?? []) as AnalyticsEventRow[];
  const screenEvents = (screenEventsRes.data ?? []) as AnalyticsEventRow[];
  const eggSelectedEvents = (eggSelectedRes.data ?? []) as { props: Record<string, unknown> | null }[];
  const comboClickEvents = (comboClicksRes.data ?? []) as { props: Record<string, unknown> | null }[];
  const eggNameById = new Map((eggTypesRes.data ?? []).map((e) => [e.id as string, e.name_th as string]));

  // ============================================================
  // บล็อก 1: แถบสรุป (7 วัน)
  // ============================================================
  const activeUserIds = new Set<string>();
  const userDayPairs = new Set<string>();
  const userDaySets = new Map<string, Set<string>>();
  let sessionStartCount = 0;
  let answerCount7d = 0;
  let answerCorrect7d = 0;

  for (const e of summaryEvents) {
    if (!e.user_id) continue;
    const dateKey = bkkDateKey(e.client_ts);
    activeUserIds.add(e.user_id);
    userDayPairs.add(`${e.user_id}|${dateKey}`);
    if (!userDaySets.has(e.user_id)) userDaySets.set(e.user_id, new Set());
    userDaySets.get(e.user_id)!.add(dateKey);
    if (e.event_name === "session_start") sessionStartCount++;
    if (e.event_name === "question_answer") {
      answerCount7d++;
      if (e.props?.is_correct) answerCorrect7d++;
    }
  }

  const activeUsers7d = activeUserIds.size;
  const avgSessionsPerUserPerDay = userDayPairs.size > 0 ? sessionStartCount / userDayPairs.size : 0;
  const avgAccuracyPct = answerCount7d > 0 ? (answerCorrect7d / answerCount7d) * 100 : 0;

  let returningUsers = 0;
  for (const days of userDaySets.values()) {
    if (days.size >= 2) returningUsers++;
  }
  const returnRatePct = activeUsers7d > 0 ? (returningUsers / activeUsers7d) * 100 : 0;

  // ============================================================
  // บล็อก 2: คำถามต่อวัน (14 วัน, รวม/เฉลี่ยต่อคน สลับได้ที่ client)
  // ============================================================
  const byDay = new Map<string, { total: number; users: Set<string> }>();
  for (const e of detailAnswers) {
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
  // บล็อก 6: บทเรียนยากสุด (จาก dataset เดียวกับบล็อก 2 — question_answer 14 วัน)
  // ============================================================
  const byCategory = new Map<string, { count: number; correct: number; totalTimeMs: number }>();
  for (const e of detailAnswers) {
    const category = (e.props?.category as string | undefined) ?? "ไม่ทราบหมวด";
    if (!byCategory.has(category)) byCategory.set(category, { count: 0, correct: 0, totalTimeMs: 0 });
    const agg = byCategory.get(category)!;
    agg.count++;
    if (e.props?.is_correct) agg.correct++;
    if (typeof e.props?.time_used_ms === "number") agg.totalTimeMs += e.props.time_used_ms as number;
  }
  const hardestLessons = Array.from(byCategory.entries())
    .map(([category, agg]) => ({
      category,
      count: agg.count,
      accuracyPct: agg.count > 0 ? (agg.correct / agg.count) * 100 : 0,
      avgTimeSec: agg.count > 0 ? agg.totalTimeMs / agg.count / 1000 : 0,
    }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct);

  // ============================================================
  // บล็อก 3+4: drop-off % และ เวลาต่อหน้าจอ (14 วัน, group ตาม session_id)
  // ============================================================
  const bySession = new Map<string, AnalyticsEventRow[]>();
  for (const e of screenEvents) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id)!.push(e);
  }

  const dropOffCounts = new Map<string, number>();
  const screenTimeMs = new Map<string, number>();
  let totalSessions = 0;

  for (const events of bySession.values()) {
    events.sort((a, b) => new Date(a.client_ts).getTime() - new Date(b.client_ts).getTime());
    totalSessions++;

    const last = events[events.length - 1];
    const endingScreen =
      last.event_name === "session_end" ? (last.props?.last_screen as string | undefined) : (last.props?.to as string | undefined);
    if (endingScreen) {
      dropOffCounts.set(endingScreen, (dropOffCounts.get(endingScreen) ?? 0) + 1);
    }

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.event_name !== "screen_view") continue;
      const to = e.props?.to as string | undefined;
      const next = events[i + 1];
      if (!to || !next) continue; // ไม่มี event ถัดไปในเซสชัน (เช่น beacon หลุด) — ไม่รู้ระยะเวลาจริง ข้าม
      const durationMs = new Date(next.client_ts).getTime() - new Date(e.client_ts).getTime();
      if (durationMs > 0 && durationMs < MAX_SCREEN_GAP_MS) {
        screenTimeMs.set(to, (screenTimeMs.get(to) ?? 0) + durationMs);
      }
    }
  }

  const dropOffData = Array.from(dropOffCounts.entries())
    .map(([label, count]) => ({ label, value: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const timePerScreenData = Array.from(screenTimeMs.entries())
    .map(([label, ms]) => ({ label, value: Math.round(ms / 60000) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // ============================================================
  // บล็อก 5: ชอบสัตว์ — egg_selected group by egg_type_id, collection_slot_click (เฉพาะ is_filled)
  // ============================================================
  const eggCounts = new Map<string, number>();
  for (const e of eggSelectedEvents) {
    const id = (e.props?.egg_type_id as string | undefined) ?? "ไม่ทราบ";
    eggCounts.set(id, (eggCounts.get(id) ?? 0) + 1);
  }
  const eggData = Array.from(eggCounts.entries())
    .map(([id, value]) => ({ label: eggNameById.get(id) ?? id, value }))
    .sort((a, b) => b.value - a.value);

  const comboCounts = new Map<string, { eggTypeId: string; subline: string; personality: string; count: number }>();
  for (const e of comboClickEvents) {
    if (!e.props?.is_filled) continue; // นับเฉพาะ combo ที่ปลดล็อกแล้วจริง ไม่นับคลิกช่อง ??? ที่ยังไม่ปลดล็อก
    const eggTypeId = (e.props?.egg_type_id as string | undefined) ?? "?";
    const subline = (e.props?.subline as string | undefined) ?? "?";
    const personality = (e.props?.personality as string | undefined) ?? "?";
    const key = `${eggTypeId}|${subline}|${personality}`;
    if (!comboCounts.has(key)) comboCounts.set(key, { eggTypeId, subline, personality, count: 0 });
    comboCounts.get(key)!.count++;
  }
  const comboData = Array.from(comboCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // ============================================================
  // บล็อก 7: ระยะเวลาเซสชันเฉลี่ย — ต่อ session_id หา max(client_ts)-min(client_ts)
  // (exclude แอดมิน, session ที่มี event เดียว duration=0 นับรวมด้วยไม่ filter ทิ้ง)
  // ============================================================
  const sessionEvents = (sessionEventsRes.data ?? []) as {
    user_id: string | null;
    session_id: string;
    client_ts: string;
  }[];
  const sessionTsMap = new Map<string, number[]>();
  for (const e of sessionEvents) {
    if (e.user_id && adminUserIds.has(e.user_id)) continue;
    if (!sessionTsMap.has(e.session_id)) sessionTsMap.set(e.session_id, []);
    sessionTsMap.get(e.session_id)!.push(new Date(e.client_ts).getTime());
  }

  let totalSessionDurationSec = 0;
  let sessionCount = 0;
  const durationByDay = new Map<string, { totalSec: number; count: number }>();

  for (const tsList of sessionTsMap.values()) {
    const minTs = Math.min(...tsList);
    const maxTs = Math.max(...tsList);
    const durationSec = (maxTs - minTs) / 1000;
    totalSessionDurationSec += durationSec;
    sessionCount++;
    const dateKey = bkkDateKey(new Date(minTs).toISOString());
    if (!durationByDay.has(dateKey)) durationByDay.set(dateKey, { totalSec: 0, count: 0 });
    const agg = durationByDay.get(dateKey)!;
    agg.totalSec += durationSec;
    agg.count++;
  }

  const avgSessionDurationSec = sessionCount > 0 ? totalSessionDurationSec / sessionCount : 0;

  const sessionTrendData = [];
  for (let i = DETAIL_WINDOW_DAYS - 1; i >= 0; i--) {
    const iso = isoDaysAgo(i);
    const dateKey = bkkDateKey(iso);
    const agg = durationByDay.get(dateKey);
    sessionTrendData.push({
      label: new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(
        new Date(iso)
      ),
      value: agg && agg.count > 0 ? Math.round((agg.totalSec / agg.count / 60) * 10) / 10 : 0,
    });
  }

  // ============================================================
  // บล็อก 8+9: Egg funnel + Evolution funnel — นับทั้งหมด (all-time) จาก player_eggs/pets ตรงๆ
  // ============================================================
  type PlayerEggFunnelRow = { hatched_at: string | null; hatched_pet_id: string | null };
  type PetFunnelRow = { id: string; stage: number; is_active: boolean };

  const playerEggRows = (playerEggsRes.data ?? []) as PlayerEggFunnelRow[];
  const allPets = (petsRes.data ?? []) as PetFunnelRow[];
  const petById = new Map(allPets.map((p) => [p.id, p]));

  const hatchedPets = playerEggRows
    .filter((e) => e.hatched_pet_id)
    .map((e) => petById.get(e.hatched_pet_id!))
    .filter((p): p is PetFunnelRow => !!p);

  const eggFunnelData: FunnelStep[] = [
    { label: "ได้ไข่", count: playerEggRows.length },
    { label: "ฟักแล้ว", count: playerEggRows.filter((e) => e.hatched_at).length },
    { label: "ถึง stage 3", count: hatchedPets.filter((p) => p.stage >= 3).length },
    { label: "ถึง stage 4", count: hatchedPets.filter((p) => p.stage >= 4).length },
    { label: "เก็บเข้าสมุด", count: hatchedPets.filter((p) => p.stage >= 4 && !p.is_active).length },
  ];

  // pets.stage เดินหน้าอย่างเดียว (tryAdvanceStage ใน src/lib/evolution.ts ไม่มีทางลดลง)
  // จึง count(*) where stage>=N ได้ตรงๆ โดยไม่ต้องพึ่ง event ประวัติ
  const evolutionFunnelData: FunnelStep[] = [
    { label: "Stage 1", count: allPets.filter((p) => p.stage >= 1).length },
    { label: "Stage 2", count: allPets.filter((p) => p.stage >= 2).length },
    { label: "Stage 3", count: allPets.filter((p) => p.stage >= 3).length },
    { label: "Stage 4", count: allPets.filter((p) => p.stage >= 4).length },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-gold-hi">Analytics</h1>
        <p className="text-sm text-text3">ข้อมูลการเล่นของนักเรียน — สำหรับผู้พัฒนาเท่านั้น</p>
      </div>

      {/* บล็อก 1: แถบสรุป */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label={`Active users (${SUMMARY_WINDOW_DAYS} วัน)`} value={activeUsers7d.toLocaleString("th-TH")} />
        <StatTile
          label="Session เฉลี่ย/คน/วัน"
          value={avgSessionsPerUserPerDay.toFixed(1)}
          sublabel="เฉพาะวันที่มีกิจกรรมจริง"
        />
        <StatTile label="ตอบคำถามรวม" value={answerCount7d.toLocaleString("th-TH")} sublabel={`${SUMMARY_WINDOW_DAYS} วันล่าสุด`} />
        <StatTile label="ความแม่นเฉลี่ย" value={`${avgAccuracyPct.toFixed(0)}%`} sublabel={`${SUMMARY_WINDOW_DAYS} วันล่าสุด`} />
        <StatTile
          label="ระยะเวลาเซสชันเฉลี่ย"
          value={formatDurationTh(avgSessionDurationSec)}
          sublabel={`${sessionCount.toLocaleString("th-TH")} session (${DETAIL_WINDOW_DAYS} วัน, ไม่รวมแอดมิน)`}
        />
      </div>

      {/* บล็อก 2: คำถามต่อวัน */}
      <ChartCard title="คำถามต่อวัน" subtitle={`${DETAIL_WINDOW_DAYS} วันล่าสุด`}>
        <QuestionsPerDayChart data={questionsPerDay} />
      </ChartCard>

      {/* 4 การ์ด: drop-off / เวลาต่อหน้าจอ / ชอบสัตว์ / กลับมาเลี้ยง */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Drop-off" subtitle="% ของ session ที่จบอยู่หน้านี้เป็นหน้าสุดท้าย">
          <BarChartCard data={dropOffData} color={CHART_AMBER} valueSuffix="%" />
        </ChartCard>

        <ChartCard title="เวลาต่อหน้าจอ" subtitle={`รวมนาทีทั้งหมด (${DETAIL_WINDOW_DAYS} วัน)`}>
          <BarChartCard data={timePerScreenData} color={CHART_INDIGO} valueSuffix=" นาที" />
        </ChartCard>

        <ChartCard title="ชอบสัตว์" subtitle="ไข่ที่ฟักบ่อยสุด">
          <BarChartCard data={eggData} color={CHART_AMBER} height={160} />
          {comboData.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs text-text3">Combo ที่คนเปิดดูบ่อย (เฉพาะตัวที่ปลดล็อกแล้ว)</p>
              <ul className="flex flex-col gap-1.5">
                {comboData.map((c) => (
                  <li key={`${c.eggTypeId}|${c.subline}|${c.personality}`} className="flex items-center justify-between text-xs">
                    <span className="text-text2">
                      {eggNameById.get(c.eggTypeId) ?? c.eggTypeId} · {SUBLINE_LABEL[c.subline] ?? c.subline} · {c.personality}
                    </span>
                    <span className="font-bold text-text">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>

        <ChartCard title="กลับมาเลี้ยง" subtitle={`% ที่เล่นซ้ำ >= 2 วันใน ${SUMMARY_WINDOW_DAYS} วันล่าสุด`}>
          <div className="flex h-full items-center justify-center py-6">
            <p className="text-5xl font-bold text-gold-hi">{returnRatePct.toFixed(0)}%</p>
          </div>
          <p className="text-center text-xs text-text3">
            {returningUsers.toLocaleString("th-TH")} / {activeUsers7d.toLocaleString("th-TH")} คน
          </p>
        </ChartCard>
      </div>

      {/* บล็อก 6: บทเรียนยากสุด */}
      <ChartCard title="บทเรียนยากสุด" subtitle={`เรียงจากความแม่นน้อย→มาก (${DETAIL_WINDOW_DAYS} วัน)`}>
        {hardestLessons.length === 0 ? (
          <p className="py-8 text-center text-sm text-text3">ยังไม่มีข้อมูลพอ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text3">
                  <th className="py-2 pr-3 font-medium">หมวด</th>
                  <th className="py-2 pr-3 font-medium">ความแม่น</th>
                  <th className="py-2 pr-3 font-medium">เวลาเฉลี่ย</th>
                  <th className="py-2 pr-3 font-medium text-right">จำนวนข้อ</th>
                </tr>
              </thead>
              <tbody>
                {hardestLessons.map((row) => {
                  const isBad = row.accuracyPct < 50;
                  return (
                    <tr key={row.category} className="border-b border-border/50">
                      <td className={`py-2 pr-3 ${isBad ? "font-bold text-red" : "text-text"}`}>
                        {isBad && "⚠️ "}
                        {row.category}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-track">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, row.accuracyPct)}%`,
                                backgroundColor: isBad ? CHART_RED : CHART_INDIGO,
                                opacity: isBad ? 1 : 0.85,
                              }}
                            />
                          </div>
                          <span className={isBad ? "font-bold text-red" : "text-text2"}>{row.accuracyPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-text2">{row.avgTimeSec.toFixed(1)} วิ</td>
                      <td className="py-2 pr-3 text-right text-text2">{row.count.toLocaleString("th-TH")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {/* บล็อก 7: เทรนด์ระยะเวลาเซสชันรายวัน */}
      <ChartCard title="ระยะเวลาเซสชันเฉลี่ยรายวัน" subtitle={`นาที/session (${DETAIL_WINDOW_DAYS} วัน, ไม่รวมแอดมิน)`}>
        <BarChartCard data={sessionTrendData} color={CHART_INDIGO} valueSuffix=" นาที" />
      </ChartCard>

      {/* บล็อก 8+9: Egg funnel / Evolution funnel */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Egg Funnel" subtitle="ได้ไข่ → ฟัก → stage 3 → stage 4 → เก็บเข้าสมุด (ทั้งหมด)">
          <FunnelChartCard steps={eggFunnelData} color={CHART_AMBER} />
        </ChartCard>

        <ChartCard title="Evolution Funnel" subtitle="จำนวน Qmon ที่เคยไปถึงแต่ละ stage (ทั้งหมด)">
          <FunnelChartCard steps={evolutionFunnelData} color={CHART_INDIGO} />
        </ChartCard>
      </div>
    </main>
  );
}
