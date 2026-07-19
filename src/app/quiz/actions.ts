"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/pagination";
import type { QuizRoundQuestion, QuizMode, Subject } from "@/types/quiz";
import {
  BASE_EXP_PER_CORRECT,
  DAILY_EXP_CAP,
  calculateExpForAnswer,
  getAccuracyMultiplier,
  getComboMultiplier,
  getTodayInBangkok,
} from "@/lib/exp";
import { tryAdvanceStage, determineSubline, getEvolutionProgress } from "@/lib/evolution";
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
export type StartQuizRoundInput = { type: "practice"; mode: QuizMode } | { type: "mission"; missionId: string };

export type StartQuizRoundResult = {
  questions: QuizRoundQuestion[];
  currentCombo: number;
  lastAttemptBeforeRound: string | null;
  missionInfo: MissionRoundInfo | null;
};

export async function startQuizRound(input: StartQuizRoundInput): Promise<StartQuizRoundResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

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

  if (mode !== "math" && mode !== "science") {
    throw new Error("โหมดไม่ถูกต้อง");
  }

  const idPageQuery = (from: number, to: number) => {
    let q = admin.from("questions").select("id").eq("status", "active").eq("subject", mode);
    if (categoryFilter) q = q.eq("category", categoryFilter);
    if (difficultyFilter !== null) q = q.eq("difficulty", difficultyFilter);
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

  // บทของภารกิจมีคำถาม active เหลือไม่พอ (หลัง exclude ที่ตอบไปแล้ว) — เติมจากทั้งวิชาแทน (ยัง
  // เคารพ difficulty filter ของ exploration อยู่) แค่ log ไว้เฉยๆ ไม่ throw (ดู design doc Phase 3)
  if (missionInfo && candidateIds.length < roundSize) {
    console.log(
      `startQuizRound: ภารกิจ "${missionInfo.category}" (${mode}) มีคำถามเหลือไม่พอ (${candidateIds.length}/${roundSize}) เติมจากทั้งวิชาแทน`
    );
    const widerRows = await fetchAllRows<{ id: number }>((from, to) => {
      let q = admin.from("questions").select("id").eq("status", "active").eq("subject", mode);
      if (difficultyFilter !== null) q = q.eq("difficulty", difficultyFilter);
      return q.range(from, to);
    });

    const existing = new Set(candidateIds);
    const extra = widerRows
      .map((r) => r.id)
      .filter((id) => !excludeIds.has(id) && !existing.has(id));
    candidateIds = [...candidateIds, ...extra];
  }

  if (roundSize === 0 || candidateIds.length === 0) {
    return { questions: [], currentCombo, lastAttemptBeforeRound, missionInfo };
  }

  const pickedIds = shuffle(candidateIds).slice(0, roundSize);

  const { data: rows, error } = await admin
    .from("questions")
    .select("id, subject, category, difficulty, question_text, choices, correct_index, explanation")
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
        correctIndex: r.correct_index,
        explanation: r.explanation,
      } satisfies QuizRoundQuestion,
    ])
  );
  const questions = pickedIds.map((id) => byId.get(id)).filter((q): q is QuizRoundQuestion => !!q);
  return { questions, currentCombo, lastAttemptBeforeRound, missionInfo };
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
  await Promise.all([
    supabase.from("quiz_attempts").insert({
      user_id: user.id,
      question_id: input.questionId,
      is_correct: isCorrect,
      pet_id: activePet.id,
      mission_id: input.missionId ?? null,
    }),
    supabase.rpc("apply_quiz_answer_pet_update", {
      p_pet_id: activePet.id,
      p_new_combo: newCombo,
      p_milestone_increment: milestoneIncrement,
      p_math_increment: mathIncrement,
      p_science_increment: scienceIncrement,
    }),
  ]);

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
    .select("id, exp, exp_today, exp_today_date, stage, math_correct, science_correct")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();
  if (!activePet) throw new Error("ยังไม่มี Qmon ที่กำลังเลี้ยงอยู่");

  const today = getTodayInBangkok();
  const expTodaySoFar = activePet.exp_today_date === today ? activePet.exp_today : 0;

  const remainingToday = Math.max(0, DAILY_EXP_CAP - expTodaySoFar);
  const expAddedToPet = Math.min(roundExpEarned, remainingToday);
  const capped = expAddedToPet < roundExpEarned;
  const newExp = activePet.exp + expAddedToPet;

  const newStage = tryAdvanceStage(activePet.stage, newExp);
  const evolutionFields: Record<string, unknown> = { stage: newStage };

  if (activePet.stage < 3 && newStage === 3) {
    // เพิ่งขยับเข้า stage 3 -> คำนวณ subline ครั้งเดียว
    evolutionFields.subline = determineSubline(activePet.math_correct, activePet.science_correct);
  }

  // stage 4 ไม่คำนวณ personality/stat_* ที่นี่แล้ว — เข้าถึง stage 4 ก่อน (stage อย่างเดียว)
  // แล้วให้ StageUpModal พาไปเลือกบุคลิกเอง จากนั้นเรียก choosePersonalityAfterEvolve()
  // (src/app/pet/actions.ts) ล็อก personality ลง DB ให้เสร็จก่อน ค่อย snapshot stat_* ทีหลัง
  const reachedStage4 = activePet.stage < 4 && newStage === 4;
  const evolved = newStage !== activePet.stage;

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

  await supabase
    .from("pets")
    .update({
      exp: newExp,
      exp_today: expTodaySoFar + expAddedToPet,
      exp_today_date: today,
      ...evolutionFields,
    })
    .eq("id", activePet.id);

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
  };
}

// server action บางๆ ห่อ claimMissionBonusIfComplete (src/lib/missions.ts) ไว้ให้ QuizClient
// ("use client") เรียกตอนจบรอบภารกิจ — missions.ts เองไม่ใช่ "use server" (เหตุผลดู comment บน
// getOrCreateTodayMission) เลยต้องมี wrapper แบบนี้ในไฟล์ที่ "use server" อยู่แล้ว
export async function claimMissionBonus(
  missionId: string,
  foodType: "A" | "B"
): Promise<ClaimMissionBonusResult> {
  const supabase = await createClient();
  return claimMissionBonusIfComplete(supabase, missionId, foodType);
}
