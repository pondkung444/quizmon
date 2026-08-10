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
  isGuaranteedPass: boolean;
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

  const { displayNeed, displayRoll, isGuaranteedPass } = computeRollDisplay(
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
    isGuaranteedPass,
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

export type EquipRaidGearResult = {
  id: string;
  slot: "head" | "body" | "feet";
  mainStat: RaidStatKey;
  mainValue: number;
  subStat: RaidStatKey | null;
  subValue: number | null;
  quality: string;
  equippedPetId: string | null;
};

function mapGearRow(row: {
  id: string;
  slot: "head" | "body" | "feet";
  main_stat: RaidStatKey;
  main_value: number;
  sub_stat: RaidStatKey | null;
  sub_value: number | null;
  quality: string;
  equipped_pet_id: string | null;
}): EquipRaidGearResult {
  return {
    id: row.id,
    slot: row.slot,
    mainStat: row.main_stat,
    mainValue: row.main_value,
    subStat: row.sub_stat,
    subValue: row.sub_value,
    quality: row.quality,
    equippedPetId: row.equipped_pet_id,
  };
}

export type EquipRaidGearOutcome =
  | { ok: true; item: EquipRaidGearResult }
  | { ok: false; message: string };

export async function equipRaidGear(itemId: string, petId: string): Promise<EquipRaidGearOutcome> {
  const supabase = await requireUser();
  const { data, error } = await supabase
    .rpc("equip_raid_gear", { p_item_id: itemId, p_pet_id: petId })
    .single();
  if (error || !data) return { ok: false, message: error?.message ?? "ใส่อุปกรณ์ไม่สำเร็จ" };
  return { ok: true, item: mapGearRow(data as Parameters<typeof mapGearRow>[0]) };
}

export async function unequipRaidGear(itemId: string): Promise<EquipRaidGearOutcome> {
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("unequip_raid_gear", { p_item_id: itemId }).single();
  if (error || !data) return { ok: false, message: error?.message ?? "ถอดอุปกรณ์ไม่สำเร็จ" };
  return { ok: true, item: mapGearRow(data as Parameters<typeof mapGearRow>[0]) };
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
  eggAwarded: boolean;
  eggTypeId: string | null;
  eggNameTh: string | null;
  eggSpritePrefix: string | null;
  pityMeter: number;
};

// claim_raid_reward return shape เปลี่ยน 11 ส.ค. 2026 (migration เพิ่ม egg_epic_01 pity) — เดิมคืน
// single gear row (คอลัมน์ id) ตอนนี้คืน TABLE ที่ column ของอุปกรณ์เปลี่ยนชื่อเป็น gear_id +
// เพิ่ม egg_awarded/egg_type_id/egg_name_th/pity_meter ต่อท้าย ไข่การันตีเฉพาะ ridge_storm ครั้งแรก
// ของ user เท่านั้น ครั้งถัดไปเข้า pity meter ปกติ (ดู raid_pity)
export async function claimRaidReward(runId: string): Promise<ClaimRaidRewardResult> {
  const supabase = await requireUser();
  const { data, error } = await supabase.rpc("claim_raid_reward", { p_run_id: runId }).single();
  if (error || !data) throw new Error(error?.message ?? "รับของไม่สำเร็จ");
  const row = data as {
    gear_id: string;
    slot: "head" | "body" | "feet";
    main_stat: RaidStatKey;
    main_value: number;
    sub_stat: RaidStatKey | null;
    sub_value: number | null;
    quality: string;
    egg_awarded: boolean;
    egg_type_id: string | null;
    egg_name_th: string | null;
    pity_meter: number;
  };

  // ไม่แตะ RPC เลย — อ่าน label_th (แสงริบหรี่/นวล/จ้า/เจิดจ้า) เพิ่มจาก raid_gear_qualities กับ
  // sprite_prefix ของไข่ (เฉพาะตอนได้ไข่รอบนี้) แยกต่างหากหลังเรียก RPC เสร็จ ยิงคู่กันได้ไม่ต้องรอกัน
  const [{ data: qualityRow }, { data: eggTypeRow }] = await Promise.all([
    supabase.from("raid_gear_qualities").select("label_th").eq("code", row.quality).maybeSingle(),
    row.egg_awarded && row.egg_type_id
      ? supabase.from("egg_types").select("sprite_prefix").eq("id", row.egg_type_id).maybeSingle()
      : Promise.resolve({ data: null as { sprite_prefix: string } | null }),
  ]);

  return {
    id: row.gear_id,
    slot: row.slot,
    mainStat: row.main_stat,
    mainValue: row.main_value,
    subStat: row.sub_stat,
    subValue: row.sub_value,
    quality: row.quality,
    qualityLabel: qualityRow?.label_th ?? null,
    eggAwarded: row.egg_awarded,
    eggTypeId: row.egg_type_id,
    eggNameTh: row.egg_name_th,
    eggSpritePrefix: eggTypeRow?.sprite_prefix ?? null,
    pityMeter: row.pity_meter,
  };
}
