import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/exp";
import { type Subline, type Personality } from "@/lib/evolution";
import { getSpeciesName } from "@/lib/petLine";
import { getJourneyDaysForRange } from "@/lib/weeklyJourney";
import { getGradeBand } from "@/lib/gradeBand";
import { CALENDAR_STAT_LABEL_JUNIOR, CALENDAR_STAT_LABEL_SENIOR } from "@/lib/labels";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CalendarDay = {
  date: string; // YYYY-MM-DD Bangkok
  expEarned: number; // capped ที่ 180
  hasData: boolean; // มีแถวใน quiz_attempts วันนั้นไหม (ไม่ใช่ expEarned > 0 — ดูคอมเมนต์ hasAttempts ใน weeklyJourney.ts)
  petId: string | null;
  stage: number | null;
  subline: string | null;
  personality: string | null;
  spritePrefix: string | null;
  formName: string | null; // จาก getSpeciesName() — null ถ้ายังไม่มี pet วันนั้น
  // junior: คณิต/วิทย์/รวม (3 entries) · senior: ฟิสิกส์/เคมี/ชีวะ (3 entries ไม่มี "รวม")
  statBreakdown: { key: string; label: string; count: number }[];
  isToday: boolean;
  isFuture: boolean;
};

// จำนวนวันในเดือน (Bangkok) — month เป็น 1-12 (ไม่ใช่ 0-indexed แบบ JS Date ทั่วไป)
function daysInBangkokMonth(year: number, month: number): string[] {
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= dayCount; d++) {
    dates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dates;
}

function bangkokMidnightUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+07:00`).toISOString();
}

function nextDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type SubjectCounts = { mathCorrect: number; scienceCorrect: number };

// นับคณิต/วิทย์ที่ตอบถูกรายวัน — ต้อง join quiz_attempts.question_id (bigint — เดิมเอกสาร schema.sql
// เขียนผิดว่าเป็น text, แก้แล้ว) กับ questions.id (bigint) เอง เพราะไม่มี FK/select policy เชื่อมให้
// (ดูผล survey เฟส 1.3) คำถามเก่าก่อนมีตาราง questions อาจมี question_id ที่ไม่ใช่ตัวเลขล้วน (id เดิม
// จากคนละสคีมา) — ตัดทิ้งด้วย regex แทนที่จะปล่อยให้ cast พังทั้งก้อน เดือนนั้นแค่นับคณิต/วิทย์ต่ำกว่า
// จริงเล็กน้อย (ยอมรับได้ตามหลัก v6 3.2)
async function getSubjectCountsByDay(
  supabase: SupabaseServerClient,
  userId: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<Map<string, SubjectCounts>> {
  const { data: attemptRows } = await supabase
    .from("quiz_attempts")
    .select("question_id, created_at")
    .eq("user_id", userId)
    .eq("is_correct", true)
    .is("source", null) // ตัดคำถามโบนัสดันเจี้ยนออก — เหตุผลเดียวกับ weeklyJourney.ts (ไม่ให้พองนับคณิต/วิทย์)
    .gte("created_at", rangeStartIso)
    .lt("created_at", rangeEndIso);

  const attempts = (attemptRows ?? []) as { question_id: string; created_at: string }[];

  const numericIds: number[] = [];
  for (const attempt of attempts) {
    if (/^\d+$/.test(attempt.question_id)) {
      numericIds.push(Number(attempt.question_id));
    } else {
      console.warn(`getSubjectCountsByDay: question_id ไม่ใช่ตัวเลขล้วน ข้ามไป (question_id=${attempt.question_id})`);
    }
  }

  // questions ไม่มี select policy (RLS เปิดแต่ไม่มี policy) — ต้องอ่านผ่าน service role เหมือน
  // analytics_events
  const admin = createAdminClient();
  const { data: questionRows } =
    numericIds.length > 0
      ? await admin.from("questions").select("id, subject").in("id", numericIds)
      : { data: [] as { id: number; subject: string }[] };

  const subjectById = new Map((questionRows ?? []).map((q) => [q.id as number, q.subject as string]));

  const countsByDay = new Map<string, SubjectCounts>();
  for (const attempt of attempts) {
    if (!/^\d+$/.test(attempt.question_id)) continue;
    const subject = subjectById.get(Number(attempt.question_id));
    if (subject !== "math" && subject !== "science") continue;

    const day = getTodayInBangkok(new Date(attempt.created_at));
    const counts = countsByDay.get(day) ?? { mathCorrect: 0, scienceCorrect: 0 };
    if (subject === "math") counts.mathCorrect += 1;
    else counts.scienceCorrect += 1;
    countsByDay.set(day, counts);
  }

  return countsByDay;
}

type BranchCounts = { physics: number; chemistry: number; biology: number };

// นับฟิสิกส์/เคมี/ชีวะที่ตอบถูกรายวันของ senior — มิเรอร์ getSubjectCountsByDay() ทุกจุด
// (numeric-id guard, admin client, filter source is null) ต่างแค่ join questions.branch แทน subject
async function getBranchCountsByDay(
  supabase: SupabaseServerClient,
  userId: string,
  rangeStartIso: string,
  rangeEndIso: string
): Promise<Map<string, BranchCounts>> {
  const { data: attemptRows } = await supabase
    .from("quiz_attempts")
    .select("question_id, created_at")
    .eq("user_id", userId)
    .eq("is_correct", true)
    .is("source", null)
    .gte("created_at", rangeStartIso)
    .lt("created_at", rangeEndIso);

  const attempts = (attemptRows ?? []) as { question_id: string; created_at: string }[];

  const numericIds: number[] = [];
  for (const attempt of attempts) {
    if (/^\d+$/.test(attempt.question_id)) {
      numericIds.push(Number(attempt.question_id));
    } else {
      console.warn(`getBranchCountsByDay: question_id ไม่ใช่ตัวเลขล้วน ข้ามไป (question_id=${attempt.question_id})`);
    }
  }

  const admin = createAdminClient();
  const { data: questionRows } =
    numericIds.length > 0
      ? await admin.from("questions").select("id, branch").in("id", numericIds)
      : { data: [] as { id: number; branch: string | null }[] };

  const branchById = new Map((questionRows ?? []).map((q) => [q.id as number, q.branch as string | null]));

  const countsByDay = new Map<string, BranchCounts>();
  for (const attempt of attempts) {
    if (!/^\d+$/.test(attempt.question_id)) continue;
    const branch = branchById.get(Number(attempt.question_id));
    if (branch !== "physics" && branch !== "chemistry" && branch !== "biology") continue;

    const day = getTodayInBangkok(new Date(attempt.created_at));
    const counts = countsByDay.get(day) ?? { physics: 0, chemistry: 0, biology: 0 };
    counts[branch] += 1;
    countsByDay.set(day, counts);
  }

  return countsByDay;
}

export async function getCalendarMonth(
  supabase: SupabaseServerClient,
  userId: string,
  year: number,
  month: number
): Promise<CalendarDay[]> {
  const dateList = daysInBangkokMonth(year, month);
  const rangeStartIso = bangkokMidnightUtcIso(dateList[0]);
  const rangeEndIso = bangkokMidnightUtcIso(nextDateStr(dateList[dateList.length - 1]));

  const [journeyDays, gradeBand] = await Promise.all([
    getJourneyDaysForRange(supabase, userId, dateList),
    getGradeBand(userId),
  ]);

  const subjectCountsByDay =
    gradeBand === "junior" ? await getSubjectCountsByDay(supabase, userId, rangeStartIso, rangeEndIso) : null;
  const branchCountsByDay =
    gradeBand === "senior" ? await getBranchCountsByDay(supabase, userId, rangeStartIso, rangeEndIso) : null;

  return journeyDays.map((day) => {
    let formName: string | null = null;
    if (day.spritePrefix && day.stage !== null && day.eggNameTh) {
      try {
        formName = getSpeciesName(
          day.spritePrefix,
          day.stage,
          day.subline as Subline | null,
          day.personality as Personality | null,
          day.eggNameTh
        );
      } catch {
        // stage 4 ระหว่างรอเลือกบุคลิก (personality ยัง null ชั่วคราว) — ไม่มีชื่อให้แสดง ไม่ถือเป็น error
        formName = null;
      }
    }

    let statBreakdown: { key: string; label: string; count: number }[];
    if (gradeBand === "senior") {
      const counts = branchCountsByDay!.get(day.date) ?? { physics: 0, chemistry: 0, biology: 0 };
      statBreakdown = CALENDAR_STAT_LABEL_SENIOR.map(({ key, label }) => ({
        key,
        label,
        count: counts[key],
      }));
    } else {
      const counts = subjectCountsByDay!.get(day.date) ?? { mathCorrect: 0, scienceCorrect: 0 };
      const countByKey = { math: counts.mathCorrect, science: counts.scienceCorrect };
      statBreakdown = CALENDAR_STAT_LABEL_JUNIOR.map(({ key, label }) => ({
        key,
        label,
        count: countByKey[key],
      }));
      statBreakdown.push({ key: "total", label: "รวม", count: counts.mathCorrect + counts.scienceCorrect });
    }

    return {
      date: day.date,
      expEarned: day.expEarned,
      hasData: day.hasAttempts,
      petId: day.petId,
      stage: day.stage,
      subline: day.subline,
      personality: day.personality,
      spritePrefix: day.spritePrefix,
      formName,
      statBreakdown,
      isToday: day.isToday,
      isFuture: day.isFuture,
    };
  });
}
