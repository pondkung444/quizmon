import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Subject } from "@/types/quiz";
import { getTodayInBangkok } from "@/lib/exp";
import { bangkokMidnightUtcIso, daysBeforeStr, nextDateStr } from "@/lib/topicStats";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;

const WIDE_WINDOW_DAYS = 14;
const NARROW_WINDOW_DAYS = 7;
const COLD_START_MIN_ATTEMPTS = 20;
const SKEW_RATIO = 0.2;
const RECENT_MISSIONS_LOOKBACK = 2;
const ELIGIBLE_MIN_ATTEMPTS_PRIMARY = 6;
const ELIGIBLE_MIN_ATTEMPTS_FALLBACK = 4;
const ACCURACY_ZONE_LOW = 40;
const ACCURACY_ZONE_HIGH = 84;
const ELIGIBLE_MAX_ACCURACY = 85; // เกณฑ์: ต้อง < 85%
const MIN_ACTIVE_QUESTIONS_IN_CATEGORY = 5;
// export ไว้ให้ src/app/quiz/actions.ts ใช้ filter คำถามภารกิจ exploration ตัวเดียวกัน ไม่ hardcode ซ้ำ
export const EXPLORATION_DIFFICULTY = 1;
const MISSION_TARGET_COUNT = 5;
const MISSION_BONUS_EXP = 10;

export type MissionType = "personalized" | "exploration";

export type TodayMission = {
  id: string;
  mission_type: MissionType;
  subject: Subject;
  category: string;
  target_count: number;
  baseline_accuracy: number | null;
  bonus_exp: number;
  bonus_awarded_at: string | null;
};

export type TodayMissionResult = {
  mission: TodayMission;
  answeredCount: number;
  correctCount: number;
};

export type MissionProgress = {
  mission: TodayMission;
  answeredCount: number;
  correctCount: number;
  answeredQuestionIds: number[];
};

export type ClaimMissionBonusResult = {
  claimed: boolean;
  bonusExp: number;
  answeredCount: number;
  correctCount: number;
};

type AttemptRow = { question_id: number; is_correct: boolean; created_at: string };
type QuestionMeta = { subject: Subject; category: string };
type CategoryAgg = { subject: Subject; attempted: number; correct: number };
type RecentMissionRow = { mission_date: string; mission_type: MissionType; subject: Subject; category: string };
type ClaimBonusResult = { awarded: boolean; bonus_exp: number | null; no_active_pet: boolean };

type MissionDraft = {
  mission_type: MissionType;
  subject: Subject;
  category: string;
  target_count: number;
  baseline_accuracy: number | null;
  bonus_exp: number;
};

// ภารกิจประจำวัน — เรียกจาก /pet (Server Component) ทุกครั้งที่โหลดหน้า ไม่ใช่ server action
// ("use server") เพราะไม่มี client component ไหนต้องเรียกตรง (ตาม pattern เดียวกับ
// getWeeklyTopicStats/getWeeklyJourney ที่ PetPage เรียกตรงอยู่แล้ว) ถ้า Phase 3 ต้องการ trigger
// จาก client (เช่นปุ่ม "เริ่มภารกิจ") ให้ห่อ server action บางๆ ใน src/app/pet/actions.ts เรียก
// ฟังก์ชันนี้ต่อ แทนที่จะทำ missions.ts เองเป็น "use server"
export async function getOrCreateTodayMission(
  supabase: SupabaseServerClient,
  userId: string
): Promise<TodayMissionResult> {
  const today = getTodayInBangkok();

  let mission = await fetchMissionByDate(supabase, userId, today);
  if (!mission) {
    mission = await createTodayMission(supabase, userId, today);
  }

  const missionAttempts = await fetchMissionAttempts(supabase, mission.id);
  const answeredCount = missionAttempts.length;
  const correctCount = missionAttempts.filter((r) => r.is_correct).length;

  // เคลมโบนัสย้อนหลังแบบเงียบ: ทำครบแล้วตั้งแต่รอบก่อน (เช่นตอนนั้นยังไม่มี active pet — ดู
  // claim_daily_mission_bonus() migration 021) แต่ตอนนี้มี pet active แล้ว — ใช้แถว mission ที่
  // query มาแล้วข้างบน ไม่ query เพิ่ม ไม่มี UI แจ้งอะไรเป็นพิเศษ (เด็กจะเห็นผลแค่ตอนกลับมามี
  // Qmon ตัวใหม่ ตามหลักไม่ลงโทษ) ขอบเขตแค่ภารกิจ "วันนี้" เท่านั้น ไม่ backfill ย้อนวันเก่ากว่านี้
  // (ภารกิจเก่าหมดอายุเงียบๆ ตามปกติเหมือนที่อื่นในระบบ)
  if (answeredCount >= mission.target_count && mission.bonus_awarded_at === null) {
    mission = await tryClaimBonusSilently(supabase, mission);
  }

  return { mission, answeredCount, correctCount };
}

const MISSION_SELECT_COLUMNS =
  "id, mission_type, subject, category, target_count, baseline_accuracy, bonus_exp, bonus_awarded_at";

async function fetchMissionByDate(
  supabase: SupabaseServerClient,
  userId: string,
  missionDate: string
): Promise<TodayMission | null> {
  const { data } = await supabase
    .from("daily_missions")
    .select(MISSION_SELECT_COLUMNS)
    .eq("user_id", userId)
    .eq("mission_date", missionDate)
    .maybeSingle();
  return data as TodayMission | null;
}

// ไม่เช็ค user_id เองตรงนี้ — RLS "daily_missions: select own" (migration 021) กรองให้แล้วว่า
// เห็นได้เฉพาะแถวของ auth.uid() ตัวเอง (ต้องใช้ supabase client ของ user จริง ไม่ใช่ admin)
async function fetchMissionById(supabase: SupabaseServerClient, missionId: string): Promise<TodayMission | null> {
  const { data } = await supabase
    .from("daily_missions")
    .select(MISSION_SELECT_COLUMNS)
    .eq("id", missionId)
    .maybeSingle();
  return data as TodayMission | null;
}

async function createTodayMission(
  supabase: SupabaseServerClient,
  userId: string,
  today: string
): Promise<TodayMission> {
  const draft = await buildMissionDraft(supabase, userId, today);

  const { data, error } = await supabase
    .from("daily_missions")
    .insert({ user_id: userId, mission_date: today, ...draft })
    .select(MISSION_SELECT_COLUMNS)
    .single();

  if (error) {
    // 23505 = unique_violation บน (user_id, mission_date) — อีก request/แท็บชนะ race ไปสร้างแล้ว
    // ระหว่างที่ request นี้กำลังคิด draft อยู่ — select แถวที่มีอยู่แล้วมาใช้แทน ไม่ error ต่อ
    if (error.code === "23505") {
      const existing = await fetchMissionByDate(supabase, userId, today);
      if (existing) return existing;
    }
    throw new Error(error.message);
  }

  return data as TodayMission;
}

type MissionAttemptRow = { question_id: number; is_correct: boolean };

// ใช้ร่วมกันทั้ง getOrCreateTodayMission (แค่นับ) และ getMissionProgress (ต้องรู้ question_id
// ที่ตอบไปแล้วด้วย เพื่อ exclude ตอน startQuizRound โหมด mission) — query เดียวพอสำหรับทั้งสองที่
async function fetchMissionAttempts(
  supabase: SupabaseServerClient,
  missionId: string
): Promise<MissionAttemptRow[]> {
  const { data } = await supabase.from("quiz_attempts").select("question_id, is_correct").eq("mission_id", missionId);
  return (data ?? []) as MissionAttemptRow[];
}

// เรียกจาก src/app/quiz/actions.ts (startQuizRound โหมด mission) เพื่อรู้ว่าต้องเหลือถามอีกกี่ข้อ
// และต้อง exclude question_id ไหนบ้าง (กันนับซ้ำตอนกลับมาทำต่อกลางทาง)
export async function getMissionProgress(supabase: SupabaseServerClient, missionId: string): Promise<MissionProgress> {
  const mission = await fetchMissionById(supabase, missionId);
  if (!mission) {
    throw new Error("ไม่พบภารกิจนี้ (mission_id ไม่ถูกต้อง หรือไม่ใช่ของผู้ใช้นี้)");
  }

  const rows = await fetchMissionAttempts(supabase, missionId);
  return {
    mission,
    answeredCount: rows.length,
    correctCount: rows.filter((r) => r.is_correct).length,
    answeredQuestionIds: [...new Set(rows.map((r) => r.question_id))],
  };
}

// เรียกจาก src/app/quiz/actions.ts (server action claimMissionBonus) ตอนจบรอบภารกิจจริงๆ — เช็ค
// จำนวนตอบจริงจาก DB เอง ไม่เชื่อ client ว่า "ตอบครบแล้ว" เฉยๆ (client อาจ submitAnswer บางข้อไม่ผ่าน
// เน็ตหลุดกลางทาง ดู saveWarning ใน QuizClient.tsx) ใช้ logic เดียวกับที่ getOrCreateTodayMission
// ใช้เคลมย้อนหลังแบบเงียบ (tryClaimBonusSilently) กันพฤติกรรมสองจุดเพี้ยนไปคนละแบบ
export async function claimMissionBonusIfComplete(
  supabase: SupabaseServerClient,
  missionId: string
): Promise<ClaimMissionBonusResult> {
  const { mission, answeredCount, correctCount } = await getMissionProgress(supabase, missionId);

  if (answeredCount < mission.target_count || mission.bonus_awarded_at !== null) {
    return { claimed: false, bonusExp: mission.bonus_exp, answeredCount, correctCount };
  }

  const updated = await tryClaimBonusSilently(supabase, mission);
  return {
    claimed: updated.bonus_awarded_at !== null,
    bonusExp: mission.bonus_exp,
    answeredCount,
    correctCount,
  };
}

async function tryClaimBonusSilently(
  supabase: SupabaseServerClient,
  mission: TodayMission
): Promise<TodayMission> {
  try {
    const { data } = await supabase
      .rpc("claim_daily_mission_bonus", { p_mission_id: mission.id })
      .single();
    if ((data as ClaimBonusResult | null)?.awarded) {
      return { ...mission, bonus_awarded_at: new Date().toISOString() };
    }
  } catch {
    // ไม่มี active pet ตอนนี้เหมือนกัน (no_active_pet=true) หรือ RPC พังกลางทาง (เคสหายากมาก
    // pet ถูกลบระหว่างเคลม) — เงียบเสมอ ไม่ให้หน้าเพจพังเพราะโบนัสเคลมย้อนหลังที่ไม่ใช่ critical
    // path ผู้เล่นจะได้ลองใหม่เองตอนโหลดหน้าครั้งถัดไป
  }
  return mission;
}

// ---------------------------------------------------------------------------
// อัลกอริทึมเลือกภารกิจ (Step 1-5 ตาม design doc "ระบบภารกิจประจำวัน")
// ---------------------------------------------------------------------------

async function buildMissionDraft(
  supabase: SupabaseServerClient,
  userId: string,
  today: string
): Promise<MissionDraft> {
  const admin = createAdminClient();

  // Step 1: ข้อมูล 14 วันย้อนหลัง (ตรวจความเอียง) — subset 7 วันหลังกรองจากก้อนนี้เอง ไม่ query ซ้ำ
  const wideStart = bangkokMidnightUtcIso(daysBeforeStr(today, WIDE_WINDOW_DAYS - 1));
  const rangeEnd = bangkokMidnightUtcIso(nextDateStr(today));
  const narrowStart = bangkokMidnightUtcIso(daysBeforeStr(today, NARROW_WINDOW_DAYS - 1));
  const narrowStartMs = new Date(narrowStart).getTime();

  const { data: attemptRows } = await supabase
    .from("quiz_attempts")
    .select("question_id, is_correct, created_at")
    .eq("user_id", userId)
    .gte("created_at", wideStart)
    .lt("created_at", rangeEnd);
  const attempts14 = (attemptRows ?? []) as AttemptRow[];

  const recentMissions = await getRecentMissions(supabase, userId, today);
  const recentCategories = new Set(recentMissions.map((m) => m.category));

  // Cold start: ตอบรวมทุกวิชา < 20 ข้อใน 14 วัน — นับดิบจากจำนวนแถว ไม่สนว่า join กับ questions
  // ได้หรือไม่ (ต่างจาก skew ratio ข้างล่างที่ต้องรู้ subject ถึงจะนับได้)
  if (attempts14.length < COLD_START_MIN_ATTEMPTS) {
    const subject = pickSubjectWithFewerAttempts(0, 0, today);
    return pickExplorationMission(admin, subject, recentCategories);
  }

  const questionById = await fetchQuestionMeta(admin, attempts14);

  let mathCount14 = 0;
  let scienceCount14 = 0;
  for (const a of attempts14) {
    const meta = questionById.get(a.question_id);
    if (!meta) continue;
    if (meta.subject === "math") mathCount14++;
    else scienceCount14++;
  }
  const total14 = mathCount14 + scienceCount14;

  let personalizedSubjectFilter: Subject | null = null;
  let explorationFallbackSubject: Subject = pickSubjectWithFewerAttempts(mathCount14, scienceCount14, today);

  if (total14 > 0) {
    const mathRatio = mathCount14 / total14;
    const scienceRatio = scienceCount14 / total14;

    if (mathRatio < SKEW_RATIO || scienceRatio < SKEW_RATIO) {
      const missingSubject: Subject = mathRatio < SKEW_RATIO ? "math" : "science";
      const dominantSubject: Subject = missingSubject === "math" ? "science" : "math";

      // Step 3: เคยมีภารกิจสำรวจ "วิชาที่หาย" นี้ในภารกิจ 2 แถวล่าสุดหรือยัง — ถ้าไม่เคย วันนี้
      // สำรวจวิชานั้นเลย (cadence ~1 ใน 3 วัน)
      const hasRecentExplorationInMissingSubject = recentMissions.some(
        (m) => m.mission_type === "exploration" && m.subject === missingSubject
      );
      if (!hasRecentExplorationInMissingSubject) {
        return pickExplorationMission(admin, missingSubject, recentCategories);
      }

      // มีแล้วเมื่อไม่นาน — วันนี้ personalized ตามปกติ แต่ล็อกแค่วิชาที่เขาเล่นอยู่จริง
      personalizedSubjectFilter = dominantSubject;
      explorationFallbackSubject = dominantSubject;
    }
  }

  // Step 4: 7 วันล่าสุด group by บท — กรองจาก attempts14 ที่มีอยู่แล้วด้วย timestamp เทียบเป็น
  // ตัวเลข (ไม่เทียบ string ตรงๆ เพราะ Date#toISOString() ลงท้าย "Z" แต่ created_at จาก DB ลงท้าย
  // "+00:00" — คนละ suffix แม้ค่าจะเท่ากัน เทียบ string ตรงๆ เสี่ยงผิดตรงขอบเขตพอดี)
  const attempts7 = attempts14.filter((a) => new Date(a.created_at).getTime() >= narrowStartMs);

  const categoryAgg = aggregateByCategory(attempts7, questionById, personalizedSubjectFilter);
  const chosen = await selectEligibleCategory(admin, categoryAgg, recentCategories);
  if (chosen) {
    return {
      mission_type: "personalized",
      subject: chosen.subject,
      category: chosen.category,
      target_count: MISSION_TARGET_COUNT,
      baseline_accuracy: chosen.pct,
      bonus_exp: MISSION_BONUS_EXP,
    };
  }

  // ไม่มีบทไหนผ่านเกณฑ์เลยแม้ลดเป็น >=4 แล้ว — ภารกิจสำรวจ (คงวิชาเดิมถ้าเพิ่งตัดสินใจไว้จาก
  // Step 3 ว่าวันนี้อยู่ในวิชาที่เขาเล่นอยู่ ไม่งั้นใช้กติกา "วิชาที่ตอบน้อยกว่า")
  return pickExplorationMission(admin, explorationFallbackSubject, recentCategories);
}

async function getRecentMissions(
  supabase: SupabaseServerClient,
  userId: string,
  today: string
): Promise<RecentMissionRow[]> {
  // "2 วันล่าสุด" = ภารกิจ 2 แถวล่าสุดที่มีอยู่จริง (ไม่ใช่ปฏิทิน T-1/T-2 เป๊ะ) — ถ้าผู้เล่นเว้นวรรค
  // ไปหลายวันไม่เล่น แถวจริงล่าสุด 2 แถวยังเป็นตัวแทน "เพิ่งเจอบทอะไรมา" ที่สมเหตุสมผลกว่า
  const { data } = await supabase
    .from("daily_missions")
    .select("mission_date, mission_type, subject, category")
    .eq("user_id", userId)
    .lt("mission_date", today)
    .order("mission_date", { ascending: false })
    .limit(RECENT_MISSIONS_LOOKBACK);
  return (data ?? []) as RecentMissionRow[];
}

async function fetchQuestionMeta(
  admin: AdminClient,
  attempts: AttemptRow[]
): Promise<Map<number, QuestionMeta>> {
  const ids = [...new Set(attempts.map((a) => a.question_id))];
  if (ids.length === 0) return new Map();

  const { data } = await admin.from("questions").select("id, subject, category").in("id", ids);
  return new Map(
    (data ?? []).map((q) => [q.id as number, { subject: q.subject as Subject, category: q.category as string }])
  );
}

function aggregateByCategory(
  attempts: AttemptRow[],
  questionById: Map<number, QuestionMeta>,
  subjectFilter: Subject | null
): Map<string, CategoryAgg> {
  const map = new Map<string, CategoryAgg>();
  for (const a of attempts) {
    const meta = questionById.get(a.question_id);
    if (!meta) continue;
    if (subjectFilter && meta.subject !== subjectFilter) continue;

    const agg = map.get(meta.category) ?? { subject: meta.subject, attempted: 0, correct: 0 };
    agg.attempted += 1;
    if (a.is_correct) agg.correct += 1;
    map.set(meta.category, agg);
  }
  return map;
}

async function selectEligibleCategory(
  admin: AdminClient,
  categoryAgg: Map<string, CategoryAgg>,
  recentCategories: Set<string>
): Promise<{ subject: Subject; category: string; pct: number } | null> {
  for (const minAttempts of [ELIGIBLE_MIN_ATTEMPTS_PRIMARY, ELIGIBLE_MIN_ATTEMPTS_FALLBACK]) {
    const candidates: { subject: Subject; category: string; pct: number }[] = [];

    for (const [category, agg] of categoryAgg) {
      if (agg.attempted < minAttempts) continue;
      if (recentCategories.has(category)) continue;

      const pct = Math.round((agg.correct / agg.attempted) * 100);
      if (pct >= ELIGIBLE_MAX_ACCURACY) continue;

      const activeCount = await countActiveQuestions(admin, agg.subject, category);
      if (activeCount < MIN_ACTIVE_QUESTIONS_IN_CATEGORY) continue;

      candidates.push({ subject: agg.subject, category, pct });
    }

    if (candidates.length === 0) continue;

    const zoneMain = candidates
      .filter((c) => c.pct >= ACCURACY_ZONE_LOW && c.pct <= ACCURACY_ZONE_HIGH)
      .sort((a, b) => a.pct - b.pct);
    if (zoneMain.length > 0) return zoneMain[0];

    const zoneFallback = candidates.filter((c) => c.pct < ACCURACY_ZONE_LOW).sort((a, b) => a.pct - b.pct);
    if (zoneFallback.length > 0) return zoneFallback[0];
  }

  return null;
}

async function countActiveQuestions(admin: AdminClient, subject: Subject, category: string): Promise<number> {
  // head:true = ขอแค่ count (COUNT(*) ฝั่ง DB) ไม่ขอแถวจริง — เลี่ยง PostgREST max-rows (default
  // 1000; survey เฟส 0 เจอคำถาม active จริง 1,118 แถว ถ้า select ตรงๆ ไม่ใส่ count จะโดนตัดเงียบ
  // ได้ตัวเลขผิดแบบเดียวกับที่เจอตอน survey)
  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("subject", subject)
    .eq("category", category)
    .eq("status", "active");
  return count ?? 0;
}

async function pickExplorationMission(
  admin: AdminClient,
  subject: Subject,
  recentCategories: Set<string>
): Promise<MissionDraft> {
  const { data } = await admin
    .from("questions")
    .select("category")
    .eq("subject", subject)
    .eq("status", "active")
    .eq("difficulty", EXPLORATION_DIFFICULTY);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  }

  const eligible = [...counts.entries()].filter(([, n]) => n >= MIN_ACTIVE_QUESTIONS_IN_CATEGORY);
  let candidates = eligible.filter(([category]) => !recentCategories.has(category));
  if (candidates.length === 0) {
    // ทุกบทที่มีคำถามพอ ดันซ้ำกับภารกิจ 2 วันล่าสุดหมด (ไม่น่าเกิดจริง มี 11 บท/วิชา) — ยอมซ้ำ
    // บทเดิมดีกว่าไม่มีภารกิจให้เลย
    candidates = eligible;
  }
  if (candidates.length === 0) {
    throw new Error(
      `ไม่มีบทวิชา ${subject} ที่มีคำถาม active difficulty=1 ครบ ${MIN_ACTIVE_QUESTIONS_IN_CATEGORY} ข้อเลยสักบท`
    );
  }

  const [category] = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    mission_type: "exploration",
    subject,
    category,
    target_count: MISSION_TARGET_COUNT,
    baseline_accuracy: null,
    bonus_exp: MISSION_BONUS_EXP,
  };
}

function pickSubjectWithFewerAttempts(mathCount: number, scienceCount: number, today: string): Subject {
  if (mathCount < scienceCount) return "math";
  if (scienceCount < mathCount) return "science";
  // เสมอ (รวมถึงศูนย์ทั้งคู่ตอน cold start) — สลับตายตัวด้วยวันที่ กันเบ้ไปวิชาเดียวถ้าเรียกซ้ำ
  // ในวันเดียวกัน (เช่น retry หลัง unique-violation ต้องได้ผลเดิมเสมอ ไม่สุ่มใหม่ทุกครั้ง)
  const day = Number(today.slice(8, 10));
  return day % 2 === 0 ? "math" : "science";
}
