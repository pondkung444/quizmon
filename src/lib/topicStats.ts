import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/exp";
import { getGradeBand, visibleBands } from "@/lib/gradeBand";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const MAX_TOPICS_PER_ZONE = 3;
const MIN_ATTEMPTS_FOR_RANKING = 5;
const PASS_THRESHOLD_PCT = 70;
const TRAILING_DAYS = 7;

export type CategoryStat = {
  category: string;
  subject: string;
  attempted: number;
  correct: number;
  pct: number;
};

export type NotEnoughDataTopic = {
  category: string;
  subject: string;
  attempted: number;
};

export type TopicStatsResult = {
  hasAnyData: boolean;
  needsPractice: CategoryStat[];
  strong: CategoryStat[];
  notEnoughData: NotEnoughDataTopic[];
};

// export ไว้ให้ src/lib/missions.ts (ระบบภารกิจประจำวัน) เรียกใช้ pattern เดียวกันสำหรับ
// ช่วง 14/7 วัน — ไม่ต้อง copy สูตรแปลงวันแบบ Bangkok ซ้ำอีกไฟล์
export function bangkokMidnightUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+07:00`).toISOString();
}

export function nextDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function daysBeforeStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// สถิติแยกหมวด (category) ย้อนหลัง 7 วัน (Bangkok, trailing — ไม่ใช่ Mon-Sun แบบ Weekly Journey)
// ข้าม pet_id ตั้งใจ นับรวมทุกตัวที่ user เคยเลี้ยงในช่วงนี้ เหมือน getWeeklyJourney/getCalendarMonth
//
// join quiz_attempts.question_id (bigint — เดิมเอกสาร schema.sql เขียนผิดว่าเป็น text, แก้แล้ว)
// กับ questions.id (bigint) เอง เพราะไม่มี FK/select policy เชื่อมให้ (ดู
// petCalendar.ts:getSubjectCountsByDay) — supabase-js คืนค่าเป็น number อยู่แล้ว แต่ regex กันไว้
// เผื่อค่าที่ผิดปกติ (ไม่ได้อาศัยว่าเป็น text จริง)
export async function getWeeklyTopicStats(
  supabase: SupabaseServerClient,
  userId: string
): Promise<TopicStatsResult> {
  const todayStr = getTodayInBangkok();
  const rangeStartIso = bangkokMidnightUtcIso(daysBeforeStr(todayStr, TRAILING_DAYS - 1));
  const rangeEndIso = bangkokMidnightUtcIso(nextDateStr(todayStr));

  const { data: attemptRows } = await supabase
    .from("quiz_attempts")
    .select("question_id, is_correct")
    .eq("user_id", userId)
    .gte("created_at", rangeStartIso)
    .lt("created_at", rangeEndIso);

  const attempts = (attemptRows ?? []) as { question_id: string; is_correct: boolean }[];

  const numericIds = new Set<number>();
  for (const attempt of attempts) {
    if (/^\d+$/.test(attempt.question_id)) {
      numericIds.add(Number(attempt.question_id));
    } else {
      console.warn(
        `getWeeklyTopicStats: question_id ไม่ใช่ตัวเลขล้วน ข้ามไป (question_id=${attempt.question_id})`
      );
    }
  }

  // questions ไม่มี select policy (RLS เปิดแต่ไม่มี policy) — ต้องอ่านผ่าน service role
  const admin = createAdminClient();
  const band = await getGradeBand(userId);
  const { data: questionRows } =
    numericIds.size > 0
      ? await admin
          .from("questions")
          .select("id, category, subject")
          .in("id", Array.from(numericIds))
          .in("grade_band", visibleBands(band))
      : { data: [] as { id: number; category: string; subject: string }[] };

  const questionById = new Map(
    (questionRows ?? []).map((q) => [
      q.id as number,
      { category: q.category as string, subject: q.subject as string },
    ])
  );

  type Agg = { subject: string; attempted: number; correct: number };
  const byCategory = new Map<string, Agg>();

  for (const attempt of attempts) {
    if (!/^\d+$/.test(attempt.question_id)) continue;
    const q = questionById.get(Number(attempt.question_id));
    if (!q) continue;

    const agg = byCategory.get(q.category) ?? { subject: q.subject, attempted: 0, correct: 0 };
    agg.attempted += 1;
    if (attempt.is_correct) agg.correct += 1;
    byCategory.set(q.category, agg);
  }

  const notEnoughData: NotEnoughDataTopic[] = [];
  const ranked: CategoryStat[] = [];

  for (const [category, agg] of byCategory) {
    if (agg.attempted < MIN_ATTEMPTS_FOR_RANKING) {
      notEnoughData.push({ category, subject: agg.subject, attempted: agg.attempted });
      continue;
    }
    ranked.push({
      category,
      subject: agg.subject,
      attempted: agg.attempted,
      correct: agg.correct,
      pct: Math.round((agg.correct / agg.attempted) * 100),
    });
  }

  // สองกลุ่มนี้เป็น filter อิสระจากกัน (attempted>=5 && pct<70 / attempted>=5 && pct>=70) —
  // ห้ามนิยาม strong ว่า "ที่เหลือจาก needsPractice" เพราะหมวดที่ pct<70 แต่ตกไม่ติด
  // top-3 ของ needsPractice ต้องไม่โผล่ที่ไหนเลย ไม่ใช่ไหลไปโผล่ในกลุ่มแข็งแรง
  const needsPractice = ranked
    .filter((c) => c.pct < PASS_THRESHOLD_PCT)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, MAX_TOPICS_PER_ZONE);

  const strong = ranked
    .filter((c) => c.pct >= PASS_THRESHOLD_PCT)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, MAX_TOPICS_PER_ZONE);

  notEnoughData.sort((a, b) => b.attempted - a.attempted);

  return {
    hasAnyData: attempts.length > 0,
    needsPractice,
    strong,
    notEnoughData,
  };
}

export type PetSubjectStat = { subject: string; answered: number; correct: number };

// ยอดตอบคำถามแยกวิชาของ Qmon ตัวเดียว (ไม่ผูกช่วงเวลาแบบ getWeeklyTopicStats) — ใช้กับหน้ารายละเอียด
// Qmon ที่เก็บเข้าฟาร์มแล้ว (/collection/[petId]) กรอง source is null เหมือน
// growth_questions_answered/correct ใน collect_pet_with_stats_snapshot() เพื่อให้ผลรวมของทุกวิชา
// บวกกันตรงกับยอดรวมที่การ์ดเดิมโชว์อยู่แล้ว — ก็อป pattern join question_id -> questions ผ่าน admin
// client จาก getWeeklyTopicStats ด้านบน (questions ไม่มี select policy)
export async function getPetSubjectStats(
  supabase: SupabaseServerClient,
  petId: string
): Promise<PetSubjectStat[]> {
  const { data: attemptRows } = await supabase
    .from("quiz_attempts")
    .select("question_id, is_correct")
    .eq("pet_id", petId)
    .is("source", null);

  const attempts = (attemptRows ?? []) as { question_id: string; is_correct: boolean }[];
  if (attempts.length === 0) return [];

  const numericIds = new Set<number>();
  for (const attempt of attempts) {
    if (/^\d+$/.test(attempt.question_id)) {
      numericIds.add(Number(attempt.question_id));
    } else {
      console.warn(`getPetSubjectStats: question_id ไม่ใช่ตัวเลขล้วน ข้ามไป (question_id=${attempt.question_id})`);
    }
  }

  const admin = createAdminClient();
  const { data: questionRows } =
    numericIds.size > 0
      ? await admin.from("questions").select("id, subject").in("id", Array.from(numericIds))
      : { data: [] as { id: number; subject: string }[] };

  const subjectById = new Map((questionRows ?? []).map((q) => [q.id as number, q.subject as string]));

  const bySubject = new Map<string, { answered: number; correct: number }>();
  for (const attempt of attempts) {
    if (!/^\d+$/.test(attempt.question_id)) continue;
    const subject = subjectById.get(Number(attempt.question_id));
    if (!subject) continue;
    const agg = bySubject.get(subject) ?? { answered: 0, correct: 0 };
    agg.answered += 1;
    if (attempt.is_correct) agg.correct += 1;
    bySubject.set(subject, agg);
  }

  return Array.from(bySubject.entries())
    .map(([subject, agg]) => ({ subject, ...agg }))
    .sort((a, b) => b.answered - a.answered);
}
