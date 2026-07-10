"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizRoundQuestion, Subject } from "@/types/quiz";
import {
  DAILY_EXP_CAP,
  calculateExpForAnswer,
  getAccuracyMultiplier,
  getComboMultiplier,
  getTodayInBangkok,
} from "@/lib/exp";
import {
  tryAdvanceStage,
  determineSubline,
  determinePersonality,
  computeRawStats,
  snapshotStats,
  type Subline,
} from "@/lib/evolution";

const ROUND_SIZE = 5;

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

export async function startQuizRound(subject: Subject): Promise<StartQuizRoundResult> {
  if (subject !== "math" && subject !== "science") {
    throw new Error("วิชาไม่ถูกต้อง");
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

  const { data: idRows, error: idError } = await admin
    .from("questions")
    .select("id")
    .eq("subject", subject);
  if (idError) throw new Error(idError.message);
  if (!idRows || idRows.length === 0) return { questions: [], currentCombo };

  const pickedIds = shuffle(idRows.map((r) => r.id)).slice(0, ROUND_SIZE);

  const { data: rows, error } = await admin
    .from("questions")
    .select("id, category, difficulty, question_text, choices, correct_index, explanation")
    .in("id", pickedIds);
  if (error) throw new Error(error.message);

  const byId = new Map(
    (rows ?? []).map((r) => [
      r.id,
      {
        id: r.id,
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
};

export async function submitAnswer(input: {
  questionId: number;
  choiceIndex: number;
  comboBefore: number;
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
    .select("correct_index, subject")
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

  const accuracyMultiplier = getAccuracyMultiplier(recentAttempts ?? []);
  const newCombo = isCorrect ? input.comboBefore + 1 : 0;
  const comboMultiplier = getComboMultiplier(newCombo);
  const expEarned = calculateExpForAnswer(isCorrect, accuracyMultiplier, comboMultiplier);

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

  return { expEarned };
}

export type RoundFinishResult = {
  expAddedToPet: number;
  capped: boolean;
  evolved: boolean;
};

export async function finishQuizRound(roundExpEarned: number): Promise<RoundFinishResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data: activePet } = await supabase
    .from("pets")
    .select(
      "id, exp, exp_today, exp_today_date, best_combo, stage, math_correct, science_correct, egg_type_id, subline"
    )
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
  let evolutionFields: Record<string, unknown> = { stage: newStage };
  let sublineForStats: Subline | undefined;

  if (activePet.stage < 3 && newStage === 3) {
    // เพิ่งขยับเข้า stage 3 -> คำนวณ subline ครั้งเดียว
    const subline = determineSubline(activePet.math_correct, activePet.science_correct);
    evolutionFields.subline = subline;
    sublineForStats = subline;
  }

  if (activePet.stage < 4 && newStage === 4) {
    // เพิ่งขยับเข้า stage 4 -> คำนวณ personality + snapshot stat ครั้งเดียว

    // 1) นับวันเล่น distinct ใน 7 วันล่าสุด ของ pet ตัวนี้
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: recentAttempts } = await supabase
      .from("quiz_attempts")
      .select("created_at")
      .eq("pet_id", activePet.id)
      .gte("created_at", sevenDaysAgo.toISOString());
    const playDaysLast7 = new Set(
      (recentAttempts ?? []).map((a) => new Date(a.created_at).toDateString())
    ).size;
    const personality = determinePersonality(playDaysLast7);

    // 2) นับวันเล่น distinct ทั้งอายุของ pet (สำหรับ HP) + ความแม่นยำเฉลี่ย (สำหรับ FOC)
    const { data: allAttempts } = await supabase
      .from("quiz_attempts")
      .select("created_at, is_correct")
      .eq("pet_id", activePet.id);
    const daysPlayedAllTime = new Set(
      (allAttempts ?? []).map((a) => new Date(a.created_at).toDateString())
    ).size;
    const totalAttempts = allAttempts?.length ?? 0;
    const totalCorrect = (allAttempts ?? []).filter((a) => a.is_correct).length;
    const accuracyPct = totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0;

    // 3) ดึง stat_profile ของไข่ชนิดนี้
    const { data: eggType, error: eggTypeError } = await supabase
      .from("egg_types")
      .select("stat_profile")
      .eq("id", activePet.egg_type_id)
      .single();

    if (eggTypeError || !eggType?.stat_profile) {
      throw new Error(
        `ไม่พบ stat_profile ของ egg_type_id="${activePet.egg_type_id}" — ตรวจสอบว่า egg_types มีข้อมูลนี้ครบ`
      );
    }

    const subline = sublineForStats ?? (activePet.subline as Subline);
    const raw = computeRawStats({
      daysPlayedAllTime,
      mathCorrect: activePet.math_correct,
      scienceCorrect: activePet.science_correct,
      accuracyPct,
      bestCombo: activePet.best_combo,
    });
    const finalStats = snapshotStats(raw, subline, personality, eggType.stat_profile);

    evolutionFields = {
      ...evolutionFields,
      personality,
      stat_hp: finalStats.hp,
      stat_atk: finalStats.atk,
      stat_def: finalStats.def,
      stat_spd: finalStats.spd,
      stat_foc: finalStats.foc,
      evolved_at: new Date().toISOString(),
    };
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

  return { expAddedToPet, capped, evolved: newStage !== activePet.stage };
}
