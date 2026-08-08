"use server";

import { createClient } from "@/lib/supabase/server";
import { computeRollDisplay, type RaidStatKey } from "@/lib/raid/stats";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  return supabase;
}

export async function startRaidRun(petId: string, raidTypeId: string): Promise<{ runId: string }> {
  const supabase = await requireUser();
  const { data, error } = await supabase
    .rpc("start_raid_run", { p_pet_id: petId, p_raid_type_id: raidTypeId })
    .single();
  if (error || !data) throw new Error(error?.message ?? "เริ่มการท้าทายไม่สำเร็จ");
  return { runId: (data as { id: string }).id };
}

export type ChooseRaidPathResult = {
  stat: RaidStatKey;
  revealTh: string;
  rollPassed: boolean;
  resultText: string | null;
  needsQuiz: boolean;
  question: { id: number; questionText: string; choices: string[] } | null;
  // ตัวเลขที่ "เห็น" บนจอ — กลับด้านจาก fraction ที่ตัดสินผลจริงแล้ว (ดู computeRollDisplay) เป็น
  // "ต้องทอยเกิน N" แบบ D&D DC ให้ตรงสัญชาตญาณเกมทอยเต๋า ไม่ใช่ค่าดิบจาก DB — ผ่านการ์ดกับ rollPassed
  // มาแล้วที่จุดเดียว (ในนี้) ห้ามคำนวณ/กลับด้านซ้ำใน component
  displayNeed: number;
  displayRoll: number;
};

export async function chooseRaidPath(runId: string, side: "a" | "b"): Promise<ChooseRaidPathResult> {
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("choose_raid_path", { p_run_id: runId, p_side: side });
  if (error || !data) throw new Error(error?.message ?? "เลือกทางไม่สำเร็จ");

  const result = data as {
    stat: RaidStatKey;
    revealTh: string;
    rollPassed: boolean;
    resultText?: string;
    needsQuiz: boolean;
    question?: { id: number; questionText: string; choices: string[] };
    rollValueScaled: number;
    rollThresholdScaled: number;
  };

  const { displayNeed, displayRoll } = computeRollDisplay(
    result.rollValueScaled,
    result.rollThresholdScaled,
    result.rollPassed
  );

  return {
    stat: result.stat,
    revealTh: result.revealTh,
    rollPassed: result.rollPassed,
    resultText: result.resultText ?? null,
    needsQuiz: result.needsQuiz,
    question: result.question ?? null,
    displayNeed,
    displayRoll,
  };
}

export type SubmitRaidObstacleAnswerResult = { isCorrect: boolean; resultText: string };

export async function submitRaidObstacleAnswer(
  runId: string,
  choiceIndex: number
): Promise<SubmitRaidObstacleAnswerResult> {
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("submit_raid_obstacle_answer", {
    p_run_id: runId,
    p_choice_index: choiceIndex,
  });
  if (error || !data) throw new Error(error?.message ?? "ตอบคำถามไม่สำเร็จ");
  const result = data as { isCorrect: boolean; resultText: string };
  return result;
}

export type RaidBossQuestion = { seq: number; questionId: number; questionText: string; choices: string[] };

export async function startRaidBoss(runId: string): Promise<RaidBossQuestion[]> {
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("start_raid_boss", { p_run_id: runId });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { seq: number; question_id: number; question_text: string; choices: string[] }[];
  return rows.map((r) => ({ seq: r.seq, questionId: r.question_id, questionText: r.question_text, choices: r.choices }));
}

export type AnswerRaidBossResult = {
  isCorrect: boolean;
  correctIndex: number;
  explanation: string | null;
  bossCorrectCount: number;
  isLast: boolean;
  outcome: "win" | "lose_stat" | "lose_quiz" | null;
};

export async function answerRaidBoss(
  runId: string,
  seq: number,
  choiceIndex: number
): Promise<AnswerRaidBossResult> {
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("answer_raid_boss", {
    p_run_id: runId,
    p_seq: seq,
    p_choice_index: choiceIndex,
  });
  if (error || !data) throw new Error(error?.message ?? "ตอบคำถามไม่สำเร็จ");
  return data as AnswerRaidBossResult;
}

export type ClaimRaidRewardResult = {
  id: string;
  slot: "head" | "body" | "feet";
  mainStat: RaidStatKey;
  mainValue: number;
  subStat: RaidStatKey | null;
  subValue: number | null;
  quality: string;
  qualityLabel: string | null;
};

export async function claimRaidReward(runId: string): Promise<ClaimRaidRewardResult> {
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("claim_raid_reward", { p_run_id: runId }).single();
  if (error || !data) throw new Error(error?.message ?? "รับของไม่สำเร็จ");
  const row = data as {
    id: string;
    slot: "head" | "body" | "feet";
    main_stat: RaidStatKey;
    main_value: number;
    sub_stat: RaidStatKey | null;
    sub_value: number | null;
    quality: string;
  };

  // ไม่แตะ RPC เลย — อ่าน label_th (แสงริบหรี่/นวล/จ้า/เจิดจ้า) เพิ่มจาก raid_gear_qualities
  // แยกต่างหากหลังเรียก RPC เสร็จ
  const { data: qualityRow } = await supabase
    .from("raid_gear_qualities")
    .select("label_th")
    .eq("code", row.quality)
    .maybeSingle();

  return {
    id: row.id,
    slot: row.slot,
    mainStat: row.main_stat,
    mainValue: row.main_value,
    subStat: row.sub_stat,
    subValue: row.sub_value,
    quality: row.quality,
    qualityLabel: qualityRow?.label_th ?? null,
  };
}
