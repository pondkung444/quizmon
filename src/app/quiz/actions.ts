"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/pagination";
import type { QuizRoundQuestion, QuizMode, Subject } from "@/types/quiz";
import {
  BASE_EXP_PER_CORRECT,
  calculateExpForAnswer,
  getAccuracyMultiplier,
  getComboMultiplier,
  getTodayInBangkok,
} from "@/lib/exp";
import { getEvolutionProgress } from "@/lib/evolution";
import { planPetEvolution, type PetEvolvePlan } from "@/lib/petEvolution";
import { getGradeProfile, visibleBands } from "@/lib/gradeBand";
import { gradeLevelOrFilter, isTopicBandAllowed, topicBandsFor, visibleGradeLevels } from "@/lib/gradeLevel";
import { type SeniorLine } from "@/lib/petLine";
import {
  EXPLORATION_DIFFICULTY,
  getMissionProgress,
  claimMissionBonusIfComplete,
  type ClaimMissionBonusResult,
  type MissionType,
} from "@/lib/missions";
// ห้าม re-export type ผ่าน "use server" ไฟล์นี้ (เจอจริงตอน Phase 6: `export type { X };` ทำให้
// SWC server-actions codegen ของ Next 16 canary นี้งง คิดว่า X เป็น action reference จริง แล้ว throw
// "ReferenceError: X is not defined" ตอน module evaluation ทั้งที่ type ถูก erase ไปแล้วตอน compile
// — type ที่ import มาจากที่อื่น (ไม่ได้ประกาศเองในไฟล์นี้) ให้ผู้ใช้ import ตรงจากต้นทาง
// (@/lib/missions) แทน อย่า re-export ผ่านไฟล์นี้

const ROUND_SIZE = 5;

// milestone คอมโบ (raw SPD) นับทุกครั้งที่ current streak หารด้วยเลขนี้ลงตัว — ค่าคงที่แยกเฉพาะจุดนี้
// แม้จะบังเอิญเท่ากับ threshold คอมโบต่ำสุดใน exp.ts (getComboMultiplier) ก็เป็นคนละความหมาย
// ห้าม import จาก exp.ts มาแทน
const MILESTONE_INTERVAL = 3;

// "ใกล้วิวัฒนาการ" = exp คงเหลือก่อนถึง threshold ถัดไป <= 15% ของช่วง exp ทั้งหมดใน stage ปัจจุบัน
// (ช่วง = threshold ของ stage นี้ - threshold ของ stage ก่อนหน้า เพราะ pets.exp สะสมข้าม stage ไม่รีเซ็ต)
// ปรับตัวเลขนี้ได้จุดเดียวถ้าอยากให้ "ใกล้" หลวม/เข้มกว่านี้
const NEAR_EVOLUTION_RATIO = 0.15;

// ห่างจากแถว quiz_attempts ล่าสุดของ user เกินกี่วัน (นับดิบเป็น ms ไม่ตัดวันปฏิทิน — ง่ายกว่า
// และพอสำหรับ threshold ระดับวันขนาดนี้) ถึงจะถือว่าเป็น "หายไปนาน" -> ทัก comeback แทน enterGame ธรรมดา
const COMEBACK_THRESHOLD_DAYS = 3;

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function getActivePetId(supabase: SupabaseServerClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("pets")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();
  return data?.id ?? null;
}

// คอมโบไม่มี field เก็บ "จำนวนถูกติดกันปัจจุบัน" ใน pets (มีแค่ best_combo ซึ่งเป็นค่าสูงสุด
// ที่เคยทำได้) เลยนับจาก quiz_attempts ล่าสุดแทน — นับจากรายการล่าสุดไล่ถอยหลัง หยุดที่ตัวแรก
// ที่ตอบผิด ใช้ limit 20 เพราะ getComboMultiplier อิ่มตัวที่ >=10 อยู่แล้ว ไม่มีทางต้องนับเกินนี้
async function getCurrentComboStreak(supabase: SupabaseServerClient, petId: string): Promise<number> {
  const { data } = await supabase
    .from("quiz_attempts")
    .select("is_correct")
    .eq("pet_id", petId)
    .order("created_at", { ascending: false })
    .limit(20);

  let streak = 0;
  for (const attempt of data ?? []) {
    if (!attempt.is_correct) break;
    streak++;
  }
  return streak;
}

// แถว quiz_attempts ล่าสุดของ user "ก่อน" รอบนี้เริ่ม — ต้องอ่านค่านี้ตรงนี้ (ตอนเริ่มรอบ) เท่านั้น
// เพราะ submitAnswer() insert แถวใหม่ทันทีทุกข้อระหว่างเล่น ถ้าไปอ่านตอนจบรอบ (finishQuizRound)
// จะเจอแถวของรอบปัจจุบันเองปนมาแทน ทำให้เช็ค "รอบแรกของวัน"/"หายไปนานแค่ไหน" ผิดพลาด
async function getLastAttemptBeforeRound(
  supabase: SupabaseServerClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("quiz_attempts")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}

export type MissionRoundInfo = {
  missionId: string;
  missionType: MissionType;
  subject: Subject;
  category: string;
  targetCount: number;
  answeredCountBefore: number;
};

// "practice" = โหมดฝึกปกติเดิม (เลือกวิชาเอง) / "mission" = ภารกิจประจำวัน (ดู src/lib/missions.ts)
// รวมเป็น union เดียวแทนการรับ mode เฉยๆ เพราะโหมด mission ต้องโหลด subject/category/เกณฑ์จบ
// จาก daily_missions เอง ไม่ใช่ให้ client กำหนด mode/จำนวนข้อเอง (server เป็น source of truth)
// โหมด "เลือกบทฝึกฝน" — filter คำถามตรงจากบทที่เลือก แยกจาก categoryFilter เดิม (ผูก missions)
// ต้อง filter ครบทั้ง 4 field พร้อมกันเสมอ: ฟิสิกส์กับคณิต ม.ต้น ใช้ subject='math' ร่วมกัน
// filter ไม่ครบมีโอกาสดึงข้อผิดวิชาปนมา
export type TopicFilter = {
  gradeBand: string; // 'primary' | 'junior' | 'senior'
  subject: string; // 'math' | 'science'
  branch: string | null;
  chapter: string;
};

export type StartQuizRoundInput =
  | { type: "practice"; mode: QuizMode }
  | { type: "mission"; missionId: string }
  | { type: "topic"; topicFilter: TopicFilter };

export type StartQuizRoundResult = {
  questions: QuizRoundQuestion[];
  currentCombo: number;
  lastAttemptBeforeRound: string | null;
  missionInfo: MissionRoundInfo | null;
  // เฟส 2 (โหมดทบทวน): ไม่ null เฉพาะเมื่อรอบนี้ดึงข้อจากแผนจริง — ป้าย "กำลังทบทวน: {บท}" บน QuizClient
  // ห้ามส่ง paused/reduced ให้ client (เด็กต้องไม่รู้ว่าถูกลดสัดส่วน — ไม่ลงโทษทางอ้อม)
  planInfo: { chapterLabel: string } | null;
  // เฟส 4 (โจทย์จากผู้พิทักษ์): ข้อที่มีกรอบ ⊂ ข้อที่ inject จากแผน · null เมื่อไม่มี (ห้ามส่ง paused/reduced ให้ client)
  guardianQuest: { questionIds: number[]; message: string | null } | null;
};

export async function startQuizRound(input: StartQuizRoundInput): Promise<StartQuizRoundResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();
  const { band, gradeLevel } = user ? await getGradeProfile(user.id) : { band: "junior" as const, gradeLevel: null };
  // จำกัดโจทย์สุ่มตามชั้นของผู้เล่น junior/primary (ม.1 เห็นแค่ ม.1, ม.2 เห็น ม.1-2, ม.3 เห็นทุกชั้น; ป.4-6 ทำนองเดียวกัน
  // ภายในกลุ่ม ป. เท่านั้น) — null = ไม่กรอง
  // ใช้กับโหมดฝึกปกติและภารกิจเท่านั้น โหมดเลือกบทฝึกฝน (type: "topic") เปิดข้ามชั้นเหมือนเดิมโดยตั้งใจ
  const gradeLevels = visibleGradeLevels(band, gradeLevel);

  // โหมดเลือกบทฝึกฝน: cross-grade เต็มรูปแบบ ไม่ filter ตาม band/subject ของ user — query ตรงจาก
  // บทที่เลือก โดย filter ครบทั้ง 4 field เสมอ (ดู TopicFilter) ไม่ยุ่งกับ category/difficulty
  if (input.type === "topic") {
    const tf = input.topicFilter;
    // primary ↔ ไม่ใช่ primary ข้ามกันไม่ได้ทั้งสองทิศ (client ส่ง gradeBand มาเอง ห้ามเชื่อ)
    if (!isTopicBandAllowed(band, tf.gradeBand)) throw new Error("บทที่เลือกไม่ถูกต้อง");
    const [currentCombo, lastAttemptBeforeRound, idRows] = await Promise.all([
      (async () => {
        if (!user) return 0;
        const activePetId = await getActivePetId(supabase, user.id);
        return activePetId ? getCurrentComboStreak(supabase, activePetId) : 0;
      })(),
      user ? getLastAttemptBeforeRound(supabase, user.id) : Promise.resolve(null),
      fetchAllRows<{ id: number }>((from, to) => {
        let q = admin
          .from("questions")
          .select("id")
          .eq("status", "active")
          .eq("subject", tf.subject)
          .eq("grade_band", tf.gradeBand)
          .eq("chapter", tf.chapter);
        q = tf.branch === null ? q.is("branch", null) : q.eq("branch", tf.branch);
        return q.range(from, to);
      }),
    ]);

    const candidateIds = idRows.map((r) => r.id);
    if (candidateIds.length === 0) {
      return { questions: [], currentCombo, lastAttemptBeforeRound, missionInfo: null, planInfo: null, guardianQuest: null };
    }
    const pickedIds = shuffle(candidateIds).slice(0, ROUND_SIZE);
    const { data: rows, error } = await admin
      .from("questions")
      .select("id, subject, category, difficulty, question_text, choices, correct_index, explanation, image_url")
      .in("id", pickedIds);
    if (error) throw new Error(error.message);
    const byId = new Map(
      (rows ?? []).map((r) => [
        r.id,
        {
          id: r.id,
          subject: r.subject as Subject,
          category: r.category,
          difficulty: r.difficulty,
          question_text: r.question_text,
          choices: r.choices,
          image_url: r.image_url ?? null,
          correctIndex: r.correct_index,
          explanation: r.explanation,
        } satisfies QuizRoundQuestion,
      ])
    );
    const questions = pickedIds.map((id) => byId.get(id)).filter((q): q is QuizRoundQuestion => !!q);
    return { questions, currentCombo, lastAttemptBeforeRound, missionInfo: null, planInfo: null, guardianQuest: null };
  }

  let mode: QuizMode;
  let categoryFilter: string | null = null;
  let difficultyFilter: number | null = null;
  let excludeIds = new Set<number>();
  let roundSize = ROUND_SIZE;
  let missionInfo: MissionRoundInfo | null = null;

  if (input.type === "mission") {
    if (!user) throw new Error("ต้องเข้าสู่ระบบก่อนเล่นภารกิจ");
    // ล็อกบทเดียวเสมอทั้ง personalized/exploration (ดู migration 021 + design doc เปลี่ยน 1) —
    // exploration เพิ่ม filter difficulty=1 ทับอีกชั้น
    const progress = await getMissionProgress(supabase, input.missionId);
    mode = progress.mission.subject;
    categoryFilter = progress.mission.category;
    difficultyFilter = progress.mission.mission_type === "exploration" ? EXPLORATION_DIFFICULTY : null;
    excludeIds = new Set(progress.answeredQuestionIds);
    roundSize = Math.max(0, progress.mission.target_count - progress.answeredCount);
    missionInfo = {
      missionId: input.missionId,
      missionType: progress.mission.mission_type,
      subject: progress.mission.subject,
      category: progress.mission.category,
      targetCount: progress.mission.target_count,
      answeredCountBefore: progress.answeredCount,
    };
  } else {
    mode = input.mode;
  }

  // senior เลือกฝึกจากปุ่มสาย (physics/chemistry/biology) แทน subject เดิม — ต้อง filter ด้วย branch
  // เท่านั้น ไม่ใช่ subject เพราะเคมี/ชีวะ subject เดียวกัน (science) กรองด้วย subject จะได้โจทย์ปนสาย
  const isSeniorBranchMode = mode === "physics" || mode === "chemistry" || mode === "biology";

  // เฉพาะ senior เท่านั้นที่ใช้โหมดสาย — primary/junior ตกเส้น else (math/science) ตามตั้งใจ
  if (input.type === "practice" && band === "senior") {
    if (!isSeniorBranchMode) throw new Error("โหมดไม่ถูกต้อง");
  } else if (isSeniorBranchMode || (mode !== "math" && mode !== "science")) {
    throw new Error("โหมดไม่ถูกต้อง");
  }

  const idPageQuery = (from: number, to: number) => {
    let q = admin
      .from("questions")
      .select("id")
      .eq("status", "active")
      .in("grade_band", visibleBands(band));
    q = isSeniorBranchMode ? q.eq("branch", mode) : q.eq("subject", mode);
    if (categoryFilter) q = q.eq("category", categoryFilter);
    if (difficultyFilter !== null) q = q.eq("difficulty", difficultyFilter);
    if (gradeLevels) q = q.or(gradeLevelOrFilter(gradeLevels));
    return q.range(from, to);
  };

  // 3 อย่างนี้ไม่ขึ้นต่อกัน — ยิงพร้อมกันแทนการรอทีละตัว (เดิมเป็น waterfall 4 round-trip
  // ก่อนจะได้เริ่มดึงคำถามจริง ทำให้กดเลือกโหมดแล้วรอนาน)
  const [currentCombo, lastAttemptBeforeRound, idRows] = await Promise.all([
    // server คือ source of truth ของคอมโบเสมอ — คำนวณจาก quiz_attempts จริง ไม่ใช่ค่าที่ client จำไว้
    (async () => {
      if (!user) return 0;
      const activePetId = await getActivePetId(supabase, user.id);
      return activePetId ? getCurrentComboStreak(supabase, activePetId) : 0;
    })(),
    user ? getLastAttemptBeforeRound(supabase, user.id) : Promise.resolve(null),
    fetchAllRows<{ id: number }>(idPageQuery),
  ]);

  let candidateIds = idRows.map((r) => r.id).filter((id) => !excludeIds.has(id));

  // Guardian plan question injection: inject 3/5 ข้อจาก current chapter ของแผนถ้านักเรียนมี
  // guardian_plan status='active' (ไม่สนว่าสร้างผ่านทางไหน — ผู้ปกครองสร้างให้ปกติ หรือ self-serve)
  // เฉพาะ practice mode + junior เท่านั้น (isSeniorBranchMode กันไว้แล้ว เพราะ current chapter ยัง
  // ไม่ awareของ branch)
  // แผนที่นักเรียนสร้างเอง (self-serve: guardian_create_plan เขียน guardian_id = NULL ตั้งแต่ migration
  // 20260920072707 — เช็ค === user.id ไว้ด้วยเผื่อแถวเก่าก่อนหน้านั้น) ผูกกับพรีเมียม → inject เฉพาะตอน
  // self_serve_enrollment ยัง active + ยังไม่หมดอายุ หมดปุ๊บ (ณ วินาทีนั้น) fallback เป็นสุ่มปกติเหมือนคนไม่มีแผน
  // ไม่ throw — แผนที่ผู้ปกครองสร้างให้ (guardian_id = ผู้ปกครอง) ไม่เกี่ยว
  let planInjectedIds: number[] = [];
  let planChapterLabel: string | null = null;
  if (input.type === "practice" && !isSeniorBranchMode && user) {
    const { data: plan } = await admin
      .from("guardian_plan")
      .select("id, guardian_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    let activePlan = plan;
    if (plan && (plan.guardian_id === null || plan.guardian_id === user.id)) {
      const { data: enrollment } = await admin
        .from("self_serve_enrollment")
        .select("id")
        .eq("student_id", user.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!enrollment) activePlan = null;
    }

    if (activePlan) {
      const { data: currentChapter } = await admin
        .from("guardian_plan_chapters")
        .select("chapter_key, subject, branch")
        .eq("plan_id", activePlan.id)
        .eq("status", "current")
        .eq("subject", mode) // mode = 'math' | 'science' เท่านั้นตรงนี้ (isSeniorBranchMode กันไว้แล้ว)
        .maybeSingle();

      if (currentChapter) {
        const { data: cc } = await admin
          .from("curriculum_chapters")
          .select("chapter, grade_band")
          .eq("chapter_key", currentChapter.chapter_key)
          .single();

        // เฟส 2: วันนี้พัก (เด็กกดเอง/ผ่านบท) → ไม่ดึงจากแผนเลย · reduced (ถูก <40% ใน 3 วันล่าสุดที่เล่น)
        // → ดึง 1 ข้อแทน 3/5 · RPC error/ไม่มีแถว → ทำแบบเดิม ห้าม throw (service_role เท่านั้นจึงผ่าน admin)
        // เรียกเฉพาะเมื่อมี activePlan + current chapter ของวิชานี้ — คนไม่มีแผนไม่มี query เพิ่ม
        let reviewPaused = false;
        let reviewReduced = false;
        try {
          const { data: stateRows, error: stateError } = await admin.rpc("guardian_get_injection_state", {
            p_student_id: user.id,
            p_subject: mode,
          });
          if (stateError) {
            console.error("startQuizRound: guardian_get_injection_state error (non-fatal)", user.id, stateError);
          } else {
            const state = Array.isArray(stateRows) ? stateRows[0] : stateRows;
            reviewPaused = state?.paused === true;
            reviewReduced = state?.reduced === true;
          }
        } catch (err) {
          console.error("startQuizRound: guardian_get_injection_state threw (non-fatal)", user.id, err);
        }

        if (cc && !reviewPaused) {
          const chapterRows = await fetchAllRows<{ id: number }>((from, to) => {
            let q = admin
              .from("questions")
              .select("id")
              .eq("status", "active")
              .eq("subject", currentChapter.subject)
              .eq("grade_band", cc.grade_band)
              .eq("chapter", cc.chapter);
            q =
              currentChapter.branch === null
                ? q.is("branch", null)
                : q.eq("branch", currentChapter.branch);
            return q.range(from, to);
          });
          const chapterIds = chapterRows.map((r) => r.id).filter((id) => !excludeIds.has(id));
          const PLAN_COUNT = reviewReduced ? 1 : Math.ceil(roundSize / 2); // roundSize=5 → 3 จากแผน (ปัดขึ้นตามที่ตกลง) · reduced → 1
          planInjectedIds = shuffle(chapterIds).slice(0, Math.min(PLAN_COUNT, chapterIds.length));
          planChapterLabel = cc.chapter;
        }
      }
    }
  }

  // บทของภารกิจมีคำถาม active เหลือไม่พอ (หลัง exclude ที่ตอบไปแล้ว) — เติมจากทั้งวิชาแทน (ยัง
  // เคารพ difficulty filter ของ exploration อยู่) แค่ log ไว้เฉยๆ ไม่ throw (ดู design doc Phase 3)
  if (missionInfo && candidateIds.length < roundSize) {
    console.log(
      `startQuizRound: ภารกิจ "${missionInfo.category}" (${mode}) มีคำถามเหลือไม่พอ (${candidateIds.length}/${roundSize}) เติมจากทั้งวิชาแทน`
    );
    const widerRows = await fetchAllRows<{ id: number }>((from, to) => {
      let q = admin
        .from("questions")
        .select("id")
        .eq("status", "active")
        .eq("subject", mode)
        .in("grade_band", visibleBands(band));
      if (difficultyFilter !== null) q = q.eq("difficulty", difficultyFilter);
      if (gradeLevels) q = q.or(gradeLevelOrFilter(gradeLevels));
      return q.range(from, to);
    });

    const existing = new Set(candidateIds);
    const extra = widerRows
      .map((r) => r.id)
      .filter((id) => !excludeIds.has(id) && !existing.has(id));
    candidateIds = [...candidateIds, ...extra];
  }

  if (roundSize === 0 || candidateIds.length === 0) {
    return { questions: [], currentCombo, lastAttemptBeforeRound, missionInfo, planInfo: null, guardianQuest: null };
  }

  // คนที่ไม่มี plan injection (คนส่วนใหญ่ทั้งหมด) เดินโค้ดบรรทัดเดิมเป๊ะ ไม่มีอะไรเปลี่ยนแม้แต่นิดเดียว
  const pickedIds =
    planInjectedIds.length > 0
      ? shuffle([
          ...planInjectedIds,
          ...shuffle(candidateIds.filter((id) => !planInjectedIds.includes(id))).slice(
            0,
            Math.max(0, roundSize - planInjectedIds.length)
          ),
        ])
      : shuffle(candidateIds).slice(0, roundSize);

  // เฟส 4: จองข้อที่มีกรอบ (สูงสุด 2/วัน) จากข้อที่ inject จากแผน — non-fatal · ไม่มีแผน = ไม่เรียก RPC เลย
  let guardianQuest: StartQuizRoundResult["guardianQuest"] = null;
  if (planInjectedIds.length > 0 && user) {
    try {
      const { data: quest, error: questError } = await admin.rpc("guardian_reserve_quest_slots", {
        p_student_id: user.id,
        p_candidate_ids: planInjectedIds,
      });
      if (questError) throw questError;
      const framedIds = Array.isArray(quest?.framed_ids) ? (quest.framed_ids as number[]) : [];
      if (framedIds.length > 0) {
        guardianQuest = { questionIds: framedIds, message: (quest?.message as string | null) ?? null };
      }
    } catch (err) {
      console.error("[quiz] guardian_reserve_quest_slots failed:", err);
    }
  }

  const { data: rows, error } = await admin
    .from("questions")
    .select("id, subject, category, difficulty, question_text, choices, correct_index, explanation, image_url")
    .in("id", pickedIds);
  if (error) throw new Error(error.message);

  const byId = new Map(
    (rows ?? []).map((r) => [
      r.id,
      {
        id: r.id,
        subject: r.subject as Subject,
        category: r.category,
        difficulty: r.difficulty,
        question_text: r.question_text,
        choices: r.choices,
        image_url: r.image_url ?? null,
        correctIndex: r.correct_index,
        explanation: r.explanation,
      } satisfies QuizRoundQuestion,
    ])
  );
  const questions = pickedIds.map((id) => byId.get(id)).filter((q): q is QuizRoundQuestion => !!q);
  return {
    questions,
    currentCombo,
    lastAttemptBeforeRound,
    missionInfo,
    planInfo: planInjectedIds.length > 0 && planChapterLabel ? { chapterLabel: planChapterLabel } : null,
    guardianQuest,
  };
}

// เด็กกด "พักวันนี้" บนหน้ารอบเล่น — พักโหมดทบทวนถึงสิ้นวัน (เวลาไทย) DB รีเซ็ตเองพรุ่งนี้
// best-effort: error → log + false ห้าม throw
export async function pauseReviewToday(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("guardian_pause_review_today");
    if (error) {
      console.error("pauseReviewToday: guardian_pause_review_today error", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("pauseReviewToday: threw", err);
    return false;
  }
}

export type SubmitAnswerResult = {
  expEarned: number;
  // category+subject ที่ DB ยืนยันจริงตอนคะแนนนี้ถูกคิด — ให้ฝั่ง client แนบไปกับ event
  // question_answer แทนค่าที่ client ถืออยู่เอง (เข้ากับหลักเดิมของไฟล์นี้: ไม่เชื่อ state ฝั่ง client)
  category: string;
  subject: Subject;
};

export async function submitAnswer(input: {
  questionId: number;
  choiceIndex: number;
  comboBefore: number;
  mode: QuizMode;
  missionId?: string | null;
  // 'topic_select' = โหมดเลือกบทฝึกฝน (ไม่นับ leaderboard, EXP ปกติ) — null = ฝึก/ภารกิจปกติ
  source?: "topic_select" | null;
}): Promise<SubmitAnswerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อนตอบคำถาม");

  // สำคัญ: server เช็คถูก/ผิดจาก DB เองเสมอ ไม่รับ flag ถูก/ผิดจาก client
  // (client ส่งมาแค่ questionId + choiceIndex เท่านั้น) เพื่อกัน EXP โกง
  //
  // 3 read นี้ไม่ขึ้นต่อกัน — ยิงพร้อมกัน (action นี้ถูกเรียกทุกข้อที่ตอบ waterfall สะสมแล้วหน่วง
  // ตอนจบรอบที่ finishQuizRound ต้องรอคิว submission ทั้งหมด)
  const admin = createAdminClient();
  const [{ data: question, error }, { data: recentAttempts }, { data: activePet }] = await Promise.all([
    admin
      .from("questions")
      .select("correct_index, subject, category")
      .eq("id", input.questionId)
      .single(),
    supabase
      .from("quiz_attempts")
      .select("is_correct")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("pets")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single(),
  ]);
  if (error || !question) throw new Error("ไม่พบคำถามนี้");
  if (!activePet) throw new Error("ยังไม่มี Qmon ที่กำลังเลี้ยงอยู่");

  const isCorrect = input.choiceIndex === question.correct_index;

  const accuracyMultiplier = getAccuracyMultiplier(recentAttempts ?? []);
  const newCombo = isCorrect ? input.comboBefore + 1 : 0;
  const comboMultiplier = getComboMultiplier(newCombo);
  const expEarned = calculateExpForAnswer(isCorrect, accuracyMultiplier, comboMultiplier, BASE_EXP_PER_CORRECT);

  // best_combo/combo_milestones/math_correct/science_correct ห้ามคำนวณฝั่ง app แบบ
  // read-modify-write (เจอ lost-update race condition จริงตอนมีคำขอทับซ้อนกัน เช่น เปิดสองแท็บ/
  // อุปกรณ์พร้อมกัน — พิสูจน์แล้วทั้ง combo_milestones ค้าง 0 และ math_correct/science_correct
  // undercount จริงในข้อมูล user 'Dawu') เรียก RPC apply_quiz_answer_pet_update() ที่ทำ atomic
  // SQL update ทั้ง 4 คอลัมน์ในสเตทเมนต์เดียวแทน ดู supabase/migrations/020_atomic_combo_update.sql
  const milestoneIncrement = isCorrect && newCombo % MILESTONE_INTERVAL === 0 ? 1 : 0;
  const mathIncrement = isCorrect && question.subject === "math" ? 1 : 0;
  const scienceIncrement = isCorrect && question.subject === "science" ? 1 : 0;

  // insert attempt กับ RPC อัปเดต pets ไม่แตะแถวเดียวกัน — เขียนพร้อมกันได้
  // RPC เป็น security invoker -> เรียกผ่าน admin (Premium 1.5d: ผู้ใช้จะไม่มีสิทธิ์ UPDATE pets เอง)
  // activePet.id มาจาก select ด้านบนที่กรอง user_id = user.id แล้ว
  const [, { error: petUpdateError }] = await Promise.all([
    supabase.from("quiz_attempts").insert({
      user_id: user.id,
      question_id: input.questionId,
      is_correct: isCorrect,
      pet_id: activePet.id,
      mission_id: input.missionId ?? null,
      source: input.source ?? null,
    }),
    admin.rpc("apply_quiz_answer_pet_update", {
      p_pet_id: activePet.id,
      p_new_combo: newCombo,
      p_milestone_increment: milestoneIncrement,
      p_math_increment: mathIncrement,
      p_science_increment: scienceIncrement,
    }),
  ]);
  if (petUpdateError) {
    console.error("submitAnswer: apply_quiz_answer_pet_update failed", user.id, activePet.id, petUpdateError);
  }

  return { expEarned, category: question.category, subject: question.subject as Subject };
}

export type RoundFinishResult = {
  expAddedToPet: number;
  capped: boolean;
  evolved: boolean;
  reachedStage4: boolean;
  nearEvolution: boolean;
  greetingEvent: "enterGame" | "comeback" | null;
  petId: string;
  fromStage: number;
  toStage: number;
  // premium phase 3a: true = รอบนี้ได้ไข่ศักดิ์ธราจากทำเป้า 2 สัปดาห์ติด (premium_check_biweekly_egg)
  premiumBiweeklyEgg: boolean;
  // เฟส 2: แจ้งผ่านบท/ไข่/กรอบบนหน้าสรุปรอบ (GuardianRoundRewards) — ค่าเริ่มต้น [] / false / null
  // แถว 'stuck' ไม่ส่งให้เด็ก (บอกผู้ปกครองเท่านั้น §5.5)
  planPassed: { chapterName: string }[];
  planEggAwarded: boolean;
  goalFrameAwarded: "guardian_basic" | "guardian_mid" | null;
};

export async function finishQuizRound(
  roundExpEarned: number,
  lastAttemptBeforeRound: string | null
): Promise<RoundFinishResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data: activePet } = await supabase
    .from("pets")
    .select("id, exp, stage, math_correct, science_correct")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();
  if (!activePet) throw new Error("ยังไม่มี Qmon ที่กำลังเลี้ยงอยู่");

  const today = getTodayInBangkok();

  // Premium 1.5d: บวก EXP ผ่าน award_quiz_exp() (security definer, service_role เท่านั้น) — DB ล็อกแถว
  // บวก exp/exp_today แบบ atomic, reset วันตามเวลาไทย และอ่านเพดานรายวันของผู้ใช้เอง (ฟรี 180 /
  // premium 300 จาก get_daily_exp_cap) ดู supabase/migrations/20260925153832_premium_1_5c_award_quiz_exp.sql
  // activePet.id มาจาก select ด้านบนที่กรอง user_id แล้ว ไม่รับ pet id จาก client
  const amount = Number.isFinite(roundExpEarned) ? Math.min(1000, Math.max(0, Math.floor(roundExpEarned))) : 0;
  const admin = createAdminClient();
  const { data: award, error: awardError } = await admin
    .rpc("award_quiz_exp", { p_user_id: user.id, p_pet_id: activePet.id, p_amount: amount })
    .single<{ added: number; total_exp: number; today_exp: number; daily_cap: number; was_capped: boolean }>();
  if (awardError || !award) {
    // บวกไม่สำเร็จ = รอบนี้ไม่ได้ EXP และไม่ evolve แต่หน้าสรุปรอบต้องไปต่อได้ ไม่ throw
    console.error("finishQuizRound: award_quiz_exp failed", user.id, activePet.id, amount, awardError);
  }
  const expAddedToPet = award?.added ?? 0;
  const capped = award?.was_capped ?? false;
  const newExp = award?.total_exp ?? activePet.exp;

  // ตรรกะ "ขยับ stage + คิด subline ตอนเข้า stage 3" ย้ายไป src/lib/petEvolution.ts (จุดเดียว
  // ใช้ร่วมกับ PvP match-end evolution) — คิดจาก total_exp ที่ DB คืนมาหลังบวกจริง
  // บวกไม่สำเร็จ -> ไม่ plan เลย (ไม่ evolve) ใช้ stage เดิม
  const plan: PetEvolvePlan = award
    ? await planPetEvolution(supabase, user.id, activePet, newExp)
    : { newStage: activePet.stage, evolved: false, reachedStage4: false, computedSubline: null, seniorLockCounts: null };
  const newStage = plan.newStage;
  const computedSubline = plan.computedSubline;
  const seniorLockLog: { line: SeniorLine; counts: Partial<Record<SeniorLine, number>> } | null =
    plan.seniorLockCounts && plan.computedSubline
      ? { line: plan.computedSubline as SeniorLine, counts: plan.seniorLockCounts }
      : null;

  // stage 4 ไม่คำนวณ personality/stat_* ที่นี่แล้ว — เข้าถึง stage 4 ก่อน (stage อย่างเดียว)
  // แล้วให้ StageUpModal พาไปเลือกบุคลิกเอง จากนั้นเรียก choosePersonalityAfterEvolve()
  // (src/app/pet/actions.ts) ล็อก personality ลง DB ให้เสร็จก่อน ค่อย snapshot stat_* ทีหลัง
  const reachedStage4 = plan.reachedStage4;
  const evolved = plan.evolved;

  // nearEvolution คือ "ใกล้" ไม่ใช่ "ถึง" — ถ้ารอบนี้วิวัฒนาการไปแล้วไม่ต้องเช็คต่อ
  // และ stage 4 ไม่มี threshold ถัดไปให้ใกล้ (สูงสุดใน MVP, getEvolutionProgress คืน 0 ให้เอง)
  // ไม่ต้องเช็ค progress < 1 แยก: ถ้า evolved เป็น false ตัว exp ต้องต่ำกว่า threshold อยู่แล้วเสมอ
  // (ไม่งั้น tryAdvanceStage จะขยับสเตจไปแล้ว) progress ที่ได้เลยไม่มีทางแตะ 1 พอดีในเคสนี้
  const nearEvolution = !evolved && getEvolutionProgress(newStage, newExp) >= 1 - NEAR_EVOLUTION_RATIO;

  // enterGame/comeback ทักทายเฉพาะ "รอบแรกของวันนี้" เท่านั้น — เทียบวันปฏิทินไทยของแถวล่าสุด
  // ก่อนรอบนี้ (lastAttemptBeforeRound มาจาก startQuizRound ที่อ่านไว้ก่อนรอบนี้จะ insert แถวใหม่)
  // กับวันนี้ ถ้าตรงกันแปลว่าเคยเล่นมาแล้ววันนี้ ไม่ใช่รอบแรก ไม่ทักอะไรทั้งคู่
  let greetingEvent: "enterGame" | "comeback" | null = null;
  if (lastAttemptBeforeRound === null) {
    // ไม่เคยมีแถวมาก่อนเลย = ผู้เล่นใหม่ -> enterGame ธรรมดา ไม่ใช่ comeback
    greetingEvent = "enterGame";
  } else {
    const lastAttemptDate = new Date(lastAttemptBeforeRound);
    const isFirstRoundToday = getTodayInBangkok(lastAttemptDate) !== today;
    if (isFirstRoundToday) {
      const daysSinceLastAttempt = (Date.now() - lastAttemptDate.getTime()) / (24 * 60 * 60 * 1000);
      greetingEvent = daysSinceLastAttempt >= COMEBACK_THRESHOLD_DAYS ? "comeback" : "enterGame";
    }
  }

  // stage เขียนแยกหลัง award_quiz_exp (ฟังก์ชันนั้นไม่แตะ stage) — admin client ข้าม RLS จึงต้อง
  // .eq("user_id") เสมอ + guard .eq("stage", เดิม) กันเขียนทับถ้ามีคำขออื่นขยับไปก่อนแล้ว
  if (newStage !== activePet.stage) {
    const { error: stageError } = await admin
      .from("pets")
      .update({ stage: newStage })
      .eq("id", activePet.id)
      .eq("user_id", user.id)
      .eq("stage", activePet.stage);
    if (stageError) {
      console.error("finishQuizRound: stage update failed", user.id, activePet.id, newStage, stageError);
    }
  }

  if (computedSubline) {
    // idempotency guard: ล็อกได้ครั้งเดียว กันเขียนทับด้วยค่าใหม่ถ้า finishQuizRound ถูกเรียกซ้ำ
    // (สำคัญกับ senior เพราะ resolveSeniorLine() เสมอ = สุ่ม เรียกซ้ำได้ค่าไม่เหมือนเดิม)
    // pattern เดียวกับ choosePersonalityAfterEvolve() ใน src/app/pet/actions.ts ที่ใช้
    // .is("personality", null) — แยก update นี้ออกจาก stage เพราะ stage ต้องเขียนเสมอ
    // ไม่ว่า guard ของ subline จะแพ้ race หรือไม่
    const { data: lockedPet, error: sublineError } = await admin
      .from("pets")
      .update({ subline: computedSubline })
      .eq("id", activePet.id)
      .eq("user_id", user.id)
      .is("subline", null)
      .select("id, subline")
      .maybeSingle();
    if (sublineError) {
      console.error("finishQuizRound: subline lock failed", user.id, activePet.id, sublineError);
    }

    // ยิง event เฉพาะตอนล็อกสำเร็จจริง (ไม่ใช่ตอนแพ้ guard race) เก็บ counts ที่ใช้ตัดสินไว้ตรวจ
    // ย้อนหลังว่าเด็กได้สายตามเกณฑ์จริงไหม — insert ตรงๆ ไม่ใช้ track() (no-op บน server action
    // เพราะ typeof window === "undefined" เสมอฝั่งนี้ ดู src/lib/analytics.ts)
    if (lockedPet && seniorLockLog) {
      await supabase.from("analytics_events").insert({
        user_id: user.id,
        session_id: crypto.randomUUID(),
        event_name: "senior_subline_locked",
        screen: "/quiz",
        pet_id: activePet.id,
        props: {
          line: seniorLockLog.line,
          physics: seniorLockLog.counts.physics ?? 0,
          chemistry: seniorLockLog.counts.chemistry ?? 0,
          biology: seniorLockLog.counts.biology ?? 0,
        },
        client_ts: new Date().toISOString(),
      });
    }
  }

  // Guardian Module C: เช็ค chapter-pass-gate ของแผนผู้พิทักษ์ (ถ้ามี) ทุกครั้งที่จบรอบจริง —
  // RPC เองเช็คแล้วว่ามีแผน active ไหม (ไม่มี = คืน 0 แถวเฉยๆ) ไม่ต้อง exists-check ซ้ำที่นี่
  // best-effort เสมอ: ห้ามให้ side effect ของฟีเจอร์ผู้พิทักษ์ทำให้การจบ quiz รอบจริงพัง —
  // ไม่ throw ไม่ block ไม่มี UI signal ใดๆ (ยังไม่ทำ UX/reward pass ตอนนี้ตามที่ปอนด์สั่งแยกเฟส)
  // pattern เดียวกับ tryClaimBonusSilently ใน src/lib/missions.ts (กลืน error เงียบๆ) แต่ log ไว้ด้วย
  // แบบ getEligiblePets/getEligibleRaidPets (src/lib/dungeon.ts, src/lib/raid.ts) เพื่อยัง debug ได้
  let planPassed: { chapterName: string }[] = [];
  let planEggAwarded = false;
  try {
    const { data: advanceRows, error: advanceError } = await supabase.rpc("guardian_advance_plan_if_passed", {
      p_student_id: user.id,
    });
    if (advanceError) {
      console.error(
        "finishQuizRound: guardian_advance_plan_if_passed error (non-fatal)",
        user.id,
        advanceError
      );
    } else {
      // เฟส 2: เก็บเฉพาะแถวที่ผ่านบท (new_status = 'passed') — 'stuck' ไม่ส่งให้เด็ก
      const rows = (advanceRows ?? []) as {
        affected_chapter_key: string;
        new_status: string;
        egg_awarded: boolean | null;
      }[];
      const passedRows = rows.filter((r) => r.new_status === "passed");
      planEggAwarded = passedRows.some((r) => r.egg_awarded === true);
      if (passedRows.length > 0) {
        const { data: chapterNames } = await admin
          .from("curriculum_chapters")
          .select("chapter_key, chapter")
          .in("chapter_key", passedRows.map((r) => r.affected_chapter_key));
        const nameByKey = new Map((chapterNames ?? []).map((c) => [c.chapter_key, c.chapter as string]));
        planPassed = passedRows.map((r) => ({
          chapterName: nameByKey.get(r.affected_chapter_key) ?? r.affected_chapter_key,
        }));
      }
    }
  } catch (err) {
    console.error(
      "finishQuizRound: guardian_advance_plan_if_passed threw (non-fatal)",
      user.id,
      err
    );
  }

  // Guardian: เช็คว่าข้ามเป้าความสม่ำเสมอสัปดาห์นี้หรือยัง (แยกจาก plan ด้านบนตาม §5.7 — คนละ
  // RPC, คนละข้อมูล) ให้กรอบโปรไฟล์ทันทีตอนข้ามเส้นครั้งแรก/ครบ 4 สัปดาห์ (§6.1) RPC เองเช็คว่า
  // มีเป้าตั้งไว้สัปดาห์นี้ไหม (ไม่มี = no-op เงียบๆ) ไม่ต้อง exists-check ซ้ำที่นี่ — best-effort
  // เหมือน guardian_advance_plan_if_passed ด้านบนเป๊ะ ห้าม side effect ของฟีเจอร์นี้ทำให้จบ quiz
  // รอบจริงพัง
  let goalFrameAwarded: "guardian_basic" | "guardian_mid" | null = null;
  try {
    const { data: frameId, error: goalRewardError } = await supabase.rpc("guardian_check_weekly_goal_reward");
    if (goalRewardError) {
      console.error(
        "finishQuizRound: guardian_check_weekly_goal_reward error (non-fatal)",
        user.id,
        goalRewardError
      );
    } else if (frameId === "guardian_basic" || frameId === "guardian_mid") {
      goalFrameAwarded = frameId;
    }
  } catch (err) {
    console.error(
      "finishQuizRound: guardian_check_weekly_goal_reward threw (non-fatal)",
      user.id,
      err
    );
  }

  // Premium phase 3a: ไข่ศักดิ์ธราเมื่อทำเป้าสัปดาห์ได้ 2 สัปดาห์ติด — อ่าน guardian_goal_reached_weeks
  // ที่ RPC ด้านบนเพิ่งเขียน เลยต้องเรียกต่อจากมันเสมอ RPC เช็คพรีเมียม/กันไข่ซ้ำเองทั้งหมด (auth.uid())
  // false = ปกติ ไม่ใช่ error — best-effort เหมือน guardian call ด้านบน ห้ามทำให้จบ quiz รอบจริงพัง
  let premiumBiweeklyEgg = false;
  try {
    const { data: eggAwarded, error: biweeklyEggError } = await supabase.rpc("premium_check_biweekly_egg");
    if (biweeklyEggError) {
      console.error(
        "finishQuizRound: premium_check_biweekly_egg error (non-fatal)",
        user.id,
        biweeklyEggError
      );
    } else {
      premiumBiweeklyEgg = eggAwarded === true;
    }
  } catch (err) {
    console.error(
      "finishQuizRound: premium_check_biweekly_egg threw (non-fatal)",
      user.id,
      err
    );
  }

  return {
    expAddedToPet,
    capped,
    evolved,
    reachedStage4,
    nearEvolution,
    greetingEvent,
    petId: activePet.id,
    fromStage: activePet.stage,
    toStage: newStage,
    premiumBiweeklyEgg,
    planPassed,
    planEggAwarded,
    goalFrameAwarded,
  };
}

// server action บางๆ ห่อ claimMissionBonusIfComplete (src/lib/missions.ts) ไว้ให้ QuizClient
// ("use client") เรียกตอนจบรอบภารกิจ — missions.ts เองไม่ใช่ "use server" (เหตุผลดู comment บน
// getOrCreateTodayMission) เลยต้องมี wrapper แบบนี้ในไฟล์ที่ "use server" อยู่แล้ว
// 1 บทตามหลักสูตรจริง (curriculum_chapter_availability) พร้อมจำนวนข้อ active จริงจาก view —
// gradeBand ใช้ประกอบ TopicFilter ตอนเริ่มรอบ (ไม่ได้อยู่ใน spec ChapterOption เดิมแต่ frontend ต้องใช้)
export type ChapterOption = {
  gradeBand: string;
  gradeLevel: string | null;
  gradeOrder: number;
  subject: string;
  branch: string | null;
  subjectLabel: string;
  chapter: string;
  chapterOrder: number;
  questionCount: number;
  isAvailable: boolean;
};

// ดึงบทสำหรับหน้าเลือกบท — ไม่ filter ตามวิชา/ชั้นย่อยของ user (cross-grade ม.↔ม. ตามดีไซน์) แต่ primary
// แยกวง: primary เห็นเฉพาะบท ป. · junior/senior เห็นบทที่ไม่ใช่ primary (ดู topicBandsFor)
// เรียงตาม grade_order, subject_label, chapter_order
export async function getTopicChapters(): Promise<ChapterOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // ไม่ล็อกอิน → junior เหมือน startQuizRound
  const { band } = user ? await getGradeProfile(user.id) : { band: "junior" as const };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("curriculum_chapter_availability")
    .select(
      "grade_band, grade_level, grade_order, subject, branch, subject_label, chapter, chapter_order, question_count, is_available"
    )
    .in("grade_band", topicBandsFor(band))
    .order("grade_order", { ascending: true })
    .order("subject_label", { ascending: true })
    .order("chapter_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    gradeBand: r.grade_band,
    gradeLevel: r.grade_level,
    gradeOrder: r.grade_order,
    subject: r.subject,
    branch: r.branch,
    subjectLabel: r.subject_label,
    chapter: r.chapter,
    chapterOrder: r.chapter_order,
    questionCount: r.question_count,
    isAvailable: r.is_available,
  }));
}

export async function claimMissionBonus(
  missionId: string,
  foodType: "A" | "B" | null = null
): Promise<ClaimMissionBonusResult> {
  const supabase = await createClient();
  return claimMissionBonusIfComplete(supabase, missionId, foodType);
}
