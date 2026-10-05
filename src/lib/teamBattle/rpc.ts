// Team Battle — wrapper บาง ๆ ต่อ RPC (เรียกจาก client ผ่าน supabase browser client เหมือน useClassroomLobby)
// ทุกฟังก์ชัน throw BattleRpcError เมื่อ RPC ล้ม — ส่งต่อให้ explainBattleError() แปลเป็นข้อความ
//
// ห้ามมีฟังก์ชันอ่านตาราง `questions` ตรงในไฟล์นี้ — โจทย์ของผู้เล่นมาจาก tb_get_active_question เท่านั้น
// (และมือการ์ดเลือกคอลัมน์โดยไม่ดึง question_id ออกมาเลย)

import { createClient } from "@/lib/supabase/client";
import type {
  ActiveQuestion,
  BattleConfig,
  BattleState,
  MyAnswer,
  MyHandCard,
  MyMember,
  QuestionCount,
  SetupView,
  TeamId,
  TickResult,
} from "./types";

export class BattleRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BattleRpcError";
  }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().rpc(fn, args);
  if (error) throw new BattleRpcError(error.message);
  return data as T;
}

// ---- ครูเรียกได้ -----------------------------------------------------------

export const teacherRpc = {
  questionCount: (sessionId: string, config: Partial<BattleConfig>) =>
    call<QuestionCount>("get_team_battle_question_count", { p_session_id: sessionId, p_config: config }),
  create: (sessionId: string, config: Partial<BattleConfig>) =>
    call<string>("create_team_battle", { p_session_id: sessionId, p_config: config }),
  getSetup: (battleId: string) => call<SetupView>("get_team_battle_setup", { p_battle_id: battleId }),
  syncRoster: (battleId: string) => call<void>("tb_sync_roster", { p_battle_id: battleId }),
  autoSplit: (battleId: string) => call<void>("tb_auto_split", { p_battle_id: battleId }),
  setPlayer: (battleId: string, userId: string, isPlayer: boolean) =>
    call<void>("tb_set_player", { p_battle_id: battleId, p_user_id: userId, p_is_player: isPlayer }),
  movePlayer: (battleId: string, userId: string, team: TeamId) =>
    call<void>("tb_move_player", { p_battle_id: battleId, p_user_id: userId, p_team: team }),
  swapPlayers: (battleId: string, userA: string, userB: string) =>
    call<void>("tb_swap_players", { p_battle_id: battleId, p_user_a: userA, p_user_b: userB }),
  start: (battleId: string) => call<void>("tb_start", { p_battle_id: battleId }),
  cancelSetup: (battleId: string) => call<void>("tb_cancel_setup", { p_battle_id: battleId }),
  endBattle: (battleId: string) => call<void>("tb_end_battle", { p_battle_id: battleId }),
};

// ---- ผู้เล่น ---------------------------------------------------------------

export const playerRpc = {
  pickCard: (battleId: string, cardId: string) =>
    call<void>("tb_pick_card", { p_battle_id: battleId, p_card_id: cardId }),
  submitAnswer: (battleId: string, answerIndex: number) =>
    call<void>("tb_submit_answer", { p_battle_id: battleId, p_answer_index: answerIndex }),
  /** null เมื่อไม่ใช่ช่วงตอบ; throw not_a_defender ถ้าไม่ใช่ผู้เล่นทีมรับ (ทีมโจมตี/ผู้ชมห้ามเรียก) */
  getActiveQuestion: (battleId: string) =>
    call<ActiveQuestion | null>("tb_get_active_question", { p_battle_id: battleId }),
};

// ---- ทุกคนในห้อง (ครู/สมาชิก) ----------------------------------------------

export const viewerRpc = {
  getState: (battleId: string) => call<BattleState>("get_team_battle_state", { p_battle_id: battleId }),
  tick: (battleId: string) => call<TickResult>("tb_tick", { p_battle_id: battleId }),
};

// ---- อ่านตรงของตัวเอง (RLS own-row) ---------------------------------------

async function myUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  return session?.user.id ?? null;
}

/**
 * มือการ์ดของผู้บัญชาการในยก `round` — กรอง round_no และ played_at is null ฝั่ง client
 * (policy ของตารางอนุญาตให้อ่านมือยกเก่าด้วย; ไม่ select question_id ออกมา)
 */
export async function fetchMyHand(battleId: string, round: number): Promise<MyHandCard[]> {
  const uid = await myUserId();
  if (!uid) return [];
  const { data, error } = await createClient()
    .from("pvp_team_cards")
    .select("id, chapter, subject, difficulty, effect_id")
    .eq("battle_id", battleId)
    .eq("round_no", round)
    .eq("drawn_for_user_id", uid)
    .is("played_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new BattleRpcError(error.message);
  return (data ?? []) as MyHandCard[];
}

/** แถวสมาชิกของตัวเอง — null = ไม่มีแถว (เข้าช้า) ให้ถือเป็นผู้ชม */
export async function fetchMyMember(battleId: string): Promise<MyMember | null> {
  const uid = await myUserId();
  if (!uid) return null;
  const { data, error } = await createClient()
    .from("pvp_team_members")
    .select("team, is_player, commander_order")
    .eq("battle_id", battleId)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new BattleRpcError(error.message);
  return (data as MyMember | null) ?? null;
}

/** คำตอบของตัวเองในยก `round` — null = ยังไม่ได้ตอบ */
export async function fetchMyAnswer(battleId: string, round: number): Promise<MyAnswer | null> {
  const uid = await myUserId();
  if (!uid) return null;
  const { data, error } = await createClient()
    .from("pvp_team_answers")
    .select("round_no, answer_index, is_correct, timed_out")
    .eq("battle_id", battleId)
    .eq("round_no", round)
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw new BattleRpcError(error.message);
  return (data as MyAnswer | null) ?? null;
}
