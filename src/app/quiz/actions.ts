"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizRoundQuestion, QuizMode, Subject } from "@/types/quiz";
import {
  BASE_EXP_PER_CORRECT,
  DAILY_EXP_CAP,
  MIDTERM_BASE_EXP_PER_CORRECT,
  calculateExpForAnswer,
  getAccuracyMultiplier,
  getComboMultiplier,
  getMidtermAccuracyMultiplier,
  getTodayInBangkok,
} from "@/lib/exp";
import { tryAdvanceStage, determineSubline } from "@/lib/evolution";

const ROUND_SIZE = 5;

// 3 หมวดสำหรับโหมด "ติวสอบกลางภาค" — สุ่มข้ามคณิต/วิทย์ในรอบเดียว ค่าตรงกับ questions.category จริงใน DB
// (ตรวจสอบแล้ว ไม่ใช่การเดา — ดู scripts/import-inequality-factoring.mjs, import-genetics-mendelian.mjs)
const MIDTERM_CATEGORIES = [
  "อสมการ",
  "แยกตัวประกอบพหุนามดีกรีมากกว่า 2",
  "พันธุกรรมและเซลล์สืบพันธุ์",
];

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

export type StartQuizRoundResult = {
  questions: QuizRoundQuestion[];
  currentCombo: number;
};

export async function startQuizRound(mode: QuizMode): Promise<StartQuizRoundResult> {
  if (mode !== "math" && mode !== "science" && mode !== "midterm") {
    throw new Error("โหมดไม่ถูกต้อง");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // server คือ source of truth ของคอมโบเสมอ — คำนวณจาก quiz_attempts จริง ไม่ใช่ค่าที่ client จำไว้
  let currentCombo = 0;
  if (user) {
    const activePetId = await getActivePetId(supabase, user.id);
    if (activePetId) {
      currentCombo = await getCurrentComboStreak(supabase, activePetId);
    }
  }

  const admin = createAdminClient();

  const idQuery = admin.from("questions").select("id");
  const { data: idRows, error: idError } =
    mode === "midterm"
      ? await idQuery.in("category", MIDTERM_CATEGORIES)
      : await idQuery.eq("subject", mode);
  if (idError) throw new Error(idError.message);
  if (!idRows || idRows.length === 0) return { questions: [], currentCombo };

  const pickedIds = shuffle(idRows.map((r) => r.id)).slice(0, ROUND_SIZE);

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
  return { questions, currentCombo };
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
}): Promise<SubmitAnswerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อนตอบคำถาม");

  // สำคัญ: server เช็คถูก/ผิดจาก DB เองเสมอ ไม่รับ flag ถูก/ผิดจาก client
  // (client ส่งมาแค่ questionId + choiceIndex เท่านั้น) เพื่อกัน EXP โกง
  const admin = createAdminClient();
  const { data: question, error } = await admin
    .from("questions")
    .select("correct_index, subject, category")
    .eq("id", input.questionId)
    .single();
  if (error || !question) throw new Error("ไม่พบคำถามนี้");

  const isCorrect = input.choiceIndex === question.correct_index;

  const { data: recentAttempts } = await supabase
    .from("quiz_attempts")
    .select("is_correct")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const accuracyMultiplier =
    input.mode === "midterm"
      ? getMidtermAccuracyMultiplier(recentAttempts ?? [])
      : getAccuracyMultiplier(recentAttempts ?? []);
  const newCombo = isCorrect ? input.comboBefore + 1 : 0;
  const comboMultiplier = getComboMultiplier(newCombo);
  const basePoints = input.mode === "midterm" ? MIDTERM_BASE_EXP_PER_CORRECT : BASE_EXP_PER_CORRECT;
  const expEarned = calculateExpForAnswer(isCorrect, accuracyMultiplier, comboMultiplier, basePoints);

  const { data: activePet } = await supabase
    .from("pets")
    .select("id, best_combo, math_correct, science_correct")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();
  if (!activePet) throw new Error("ยังไม่มี Qmon ที่กำลังเลี้ยงอยู่");

  await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    question_id: input.questionId,
    is_correct: isCorrect,
    pet_id: activePet.id,
  });

  const petUpdates: Record<string, number> = {};
  if (newCombo > activePet.best_combo) {
    petUpdates.best_combo = newCombo;
  }
  if (isCorrect && question.subject === "math") {
    petUpdates.math_correct = activePet.math_correct + 1;
  } else if (isCorrect && question.subject === "science") {
    petUpdates.science_correct = activePet.science_correct + 1;
  }
  if (Object.keys(petUpdates).length > 0) {
    await supabase.from("pets").update(petUpdates).eq("id", activePet.id);
  }

  return { expEarned, category: question.category, subject: question.subject as Subject };
}

export type RoundFinishResult = {
  expAddedToPet: number;
  capped: boolean;
  evolved: boolean;
  reachedStage4: boolean;
  petId: string;
  fromStage: number;
  toStage: number;
};

export async function finishQuizRound(roundExpEarned: number): Promise<RoundFinishResult> {
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
    evolved: newStage !== activePet.stage,
    reachedStage4,
    petId: activePet.id,
    fromStage: activePet.stage,
    toStage: newStage,
  };
}
