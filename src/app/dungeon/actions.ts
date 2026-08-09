"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitDungeonBonusAnswerResult = {
  isCorrect: boolean;
};

// ส่ง Qmon (stage 4, เก็บเข้าฟาร์มแล้ว) ไปผจญภัย — RPC เช็ค ownership/stage/รันค้างเองอยู่แล้ว
// (unique constraint กันมีรัน in_progress ซ้อนกัน 2 อันของ user เดียว)
export async function startDungeonRun(petId: string, dungeonTypeId: string): Promise<{ runId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data, error } = await supabase
    .rpc("start_dungeon_run", { p_pet_id: petId, p_dungeon_type_id: dungeonTypeId })
    .single();

  if (error || !data) throw new Error(error?.message ?? "ออกเดินทางไม่สำเร็จ");
  return { runId: (data as { id: string }).id };
}

export type BonusQuestion = {
  id: number;
  subject: string;
  category: string;
  difficulty: number;
  questionText: string;
  choices: string[];
};

// เริ่มคำถามโบนัสของรันนี้ — ตัด correct_index/explanation ที่ RPC คืนมาออกก่อนส่งให้ client
// (ไม่จำเป็นต้องใช้ฝั่งนั้นเลย submitDungeonBonusAnswer() เช็คถูก/ผิดจาก DB เองอยู่แล้ว)
export async function startDungeonBonus(dungeonRunId: string): Promise<{ questions: BonusQuestion[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data, error } = await supabase.rpc("start_dungeon_bonus", { p_run_id: dungeonRunId });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: number;
    subject: string;
    category: string;
    difficulty: number;
    question_text: string;
    choices: string[];
  }[];

  return {
    questions: rows.map((q) => ({
      id: q.id,
      subject: q.subject,
      category: q.category,
      difficulty: q.difficulty,
      questionText: q.question_text,
      choices: q.choices,
    })),
  };
}

export type ApplyDungeonBonusResult = {
  endsAt: string;
  bonusMinutesSaved: number;
  correctCount: number;
};

// ปิดรอบคำถามโบนัส — ไม่ต้องส่งจำนวนถูกที่นับฝั่ง client จริงจัง (RPC เพิกเฉยอยู่แล้ว นับจาก
// quiz_attempts ในรันนี้เอง) ส่งไว้เผื่อ signature ต้องการเฉยๆ
export async function applyDungeonBonus(dungeonRunId: string): Promise<ApplyDungeonBonusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data, error } = await supabase
    .rpc("apply_dungeon_bonus", { p_run_id: dungeonRunId })
    .single();

  if (error || !data) throw new Error(error?.message ?? "ใช้คำถามโบนัสไม่สำเร็จ");

  const run = data as { ends_at: string; bonus_minutes_saved: number };
  return {
    endsAt: run.ends_at,
    bonusMinutesSaved: run.bonus_minutes_saved,
    correctCount: Math.round(run.bonus_minutes_saved / 12),
  };
}

export type ClaimDungeonRunResult = {
  eggAwarded: boolean;
  eggNameTh: string | null;
  eggSpritePrefix: string | null;
  pityMeter: number;
};

// เคลมรางวัลรันที่จบแล้ว — RPC ล็อกแถว/เช็ค ends_at/claimed_at เองอยู่แล้ว (ป้องกันเคลมซ้ำ/เคลมก่อนเวลา)
// ตั้งแต่ 9 ส.ค. 2026 adventure ไม่แจกอาหารแล้ว (food_kind จาก RPC จะเป็น null เสมอ) รางวัลตั๋ว
// (raid_tickets, source='dungeon_claim') RPC insert ให้เองอยู่แล้วไม่ได้อยู่ใน return value นี้
export async function claimDungeonRun(dungeonRunId: string): Promise<ClaimDungeonRunResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");

  const { data, error } = await supabase.rpc("claim_dungeon_run", { p_run_id: dungeonRunId }).single();
  if (error || !data) throw new Error(error?.message ?? "รับของไม่สำเร็จ");

  const result = data as {
    egg_awarded: boolean;
    egg_type_id: string | null;
    egg_name_th: string | null;
    egg_sprite_prefix: string | null;
    food_kind: string | null;
    pity_meter: number;
  };

  return {
    eggAwarded: result.egg_awarded,
    eggNameTh: result.egg_name_th,
    eggSpritePrefix: result.egg_sprite_prefix,
    pityMeter: result.pity_meter,
  };
}

// คำถามโบนัสระหว่างผจญภัย (ดันเจี้ยน) — insert quiz_attempts อย่างเดียว (source='dungeon_bonus')
// ห้ามให้ EXP/แตะ pets counters/daily_missions เด็ดขาด (กฎเหล็ก Phase 3) — path นี้แยกขาดจาก
// submitAnswer()/finishQuizRound() (src/app/quiz/actions.ts) โดยสิ้นเชิง
//
// ผูก dungeon_run_id ทุกแถวเสมอ (ไม่รับ "ถูกกี่ข้อ" จาก client อีกต่อไป — hardening ตาม feedback:
// apply_dungeon_bonus() นับถูก/ผิดจากแถวที่ผูก run นี้ใน DB เอง ดู
// supabase/migrations/dungeon_bonus_harden_correct_count.sql) เช็คก่อน insert ว่ารันนี้เป็นของ
// user นี้จริง และยังไม่จบ/ยังไม่ใช้โบนัส กันแอบผูกคำถามเข้ารันของคนอื่นหรือรันที่จบไปแล้ว
export async function submitDungeonBonusAnswer(input: {
  dungeonRunId: string;
  questionId: number;
  choiceIndex: number;
}): Promise<SubmitDungeonBonusAnswerResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อนตอบคำถาม");

  const { data: run } = await supabase
    .from("dungeon_runs")
    .select("id, status, bonus_quiz_used")
    .eq("id", input.dungeonRunId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) throw new Error("ไม่พบการผจญภัยนี้");
  if (run.status !== "in_progress") throw new Error("การผจญภัยนี้จบไปแล้ว");
  if (run.bonus_quiz_used) throw new Error("ใช้คำถามโบนัสของการผจญภัยนี้ไปแล้ว");

  // server เช็คถูก/ผิดจาก DB เองเสมอ ไม่รับ flag ถูก/ผิดจาก client (เหตุผลเดียวกับ submitAnswer)
  const admin = createAdminClient();
  const { data: question, error } = await admin
    .from("questions")
    .select("correct_index")
    .eq("id", input.questionId)
    .single();
  if (error || !question) throw new Error("ไม่พบคำถามนี้");

  const isCorrect = input.choiceIndex === question.correct_index;

  const { error: insertError } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    question_id: input.questionId,
    is_correct: isCorrect,
    source: "dungeon_bonus",
    dungeon_run_id: input.dungeonRunId,
  });
  if (insertError) throw new Error(insertError.message);

  return { isCorrect };
}
