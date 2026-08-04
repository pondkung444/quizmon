"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitDungeonBonusAnswerResult = {
  isCorrect: boolean;
};

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
