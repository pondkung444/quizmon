import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/exp";
import { getSpeciesName, type Subline, type Personality } from "@/lib/evolution";
import { getJourneyDaysForRange } from "@/lib/weeklyJourney";

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
  mathCorrect: number;
  scienceCorrect: number;
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

// นับคณิต/วิทย์ที่ตอบถูกรายวัน — ต้อง join quiz_attempts.question_id (text) กับ questions.id
// (bigint) เอง เพราะไม่มี FK/select policy เชื่อมให้ (ดูผล survey เฟส 1.3) คำถามเก่าก่อนมีตาราง
// questions อาจมี question_id ที่ไม่ใช่ตัวเลขล้วน (id เดิมจากคนละสคีมา) — ตัดทิ้งด้วย regex แทนที่จะ
// ปล่อยให้ cast พังทั้งก้อน เดือนนั้นแค่นับคณิต/วิทย์ต่ำกว่าจริงเล็กน้อย (ยอมรับได้ตามหลัก v6 3.2)
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

export async function getCalendarMonth(
  supabase: SupabaseServerClient,
  userId: string,
  year: number,
  month: number
): Promise<CalendarDay[]> {
  const dateList = daysInBangkokMonth(year, month);
  const rangeStartIso = bangkokMidnightUtcIso(dateList[0]);
  const rangeEndIso = bangkokMidnightUtcIso(nextDateStr(dateList[dateList.length - 1]));

  const [journeyDays, subjectCountsByDay] = await Promise.all([
    getJourneyDaysForRange(supabase, userId, dateList),
    getSubjectCountsByDay(supabase, userId, rangeStartIso, rangeEndIso),
  ]);

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

    const counts = subjectCountsByDay.get(day.date) ?? { mathCorrect: 0, scienceCorrect: 0 };

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
      mathCorrect: counts.mathCorrect,
      scienceCorrect: counts.scienceCorrect,
      isToday: day.isToday,
      isFuture: day.isFuture,
    };
  });
}
