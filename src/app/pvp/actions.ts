"use server";

import { createClient, getUser } from "@/lib/supabase/server";

async function requireUserId(): Promise<string> {
  const user = await getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  return user.id;
}

export type PvpActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export async function createPvpChallenge(
  opponentId: string,
  petId: string
): Promise<PvpActionResult<{ challengeId: string }>> {
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pvp_challenge", {
    p_opponent_id: opponentId,
    p_pet_id: petId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: { challengeId: data as string } };
}

export async function acceptPvpChallenge(
  challengeId: string,
  petId: string
): Promise<PvpActionResult<{ matchId: string }>> {
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_pvp_challenge", {
    p_challenge_id: challengeId,
    p_pet_id: petId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: { matchId: data as string } };
}

export async function declinePvpChallenge(challengeId: string): Promise<PvpActionResult> {
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_pvp_challenge", { p_challenge_id: challengeId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: null };
}

export async function cancelPvpChallenge(challengeId: string): Promise<PvpActionResult> {
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_pvp_challenge", { p_challenge_id: challengeId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: null };
}

export type PvpDrawnCard = {
  id: string;
  chapter: string;
  subject: string;
  difficulty: number;
  effect_id: string | null;
  question_id: number;
};

export async function drawPvpCards(
  matchId: string
): Promise<PvpActionResult<{ cards: PvpDrawnCard[] }>> {
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("draw_pvp_cards", { p_match_id: matchId });
  if (error) return { ok: false, message: error.message };
  const cards = ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string,
    chapter: c.chapter as string,
    subject: c.subject as string,
    difficulty: c.difficulty as number,
    effect_id: (c.effect_id as string | null) ?? null,
    question_id: c.question_id as number,
  }));
  return { ok: true, data: { cards } };
}

export async function assignPvpCard(
  matchId: string,
  cardId: string
): Promise<PvpActionResult> {
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_pvp_card", {
    p_match_id: matchId,
    p_card_id: cardId,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: null };
}

export type PvpSubmitResult = {
  is_correct: boolean | null;
  damage: number; // ดาเมจรวมที่ผู้ตอบได้รับยกนี้ (ฐาน + pierce)
  crit: boolean;
  hp_a: number;
  hp_b: number;
  status: "active" | "finished" | "abandoned";
  outcome: "a_win" | "b_win" | "draw" | null;
  winner_id: string | null;
  current_round: number;
  attacker_id: string;
  phase: "assigning" | "answering";
  // ---- สไลซ์ 2: เอฟเฟกต์การ์ด ----
  effect_id: string | null;
  effect_triggered: boolean;
  self_damage: number; // reprisal — ดาเมจสะท้อนใส่ผู้ส่ง
  heal_self: number; // lifesteal — เลือดคืนผู้ส่ง (หลัง cap)
  heal_defender: number; // heal — เลือดคืนผู้ตอบ (หลัง cap)
  pierce: number;
  defender_side: "a" | "b";
  attacker_side: "a" | "b";
  timed_out: boolean;
  noop?: boolean;
};

// answerIndex = -1 => หมดเวลา (client timer) => นับเป็นตอบผิด
export async function submitPvpCard(
  matchId: string,
  cardId: string,
  questionId: number,
  answerIndex: number
): Promise<PvpActionResult<PvpSubmitResult>> {
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_pvp_card", {
    p_match_id: matchId,
    p_card_id: cardId,
    p_question_id: questionId,
    p_answer_index: answerIndex,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data as PvpSubmitResult };
}
