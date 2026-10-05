// Team Battle — type ฝั่ง client ให้ตรงกับ JSON จริงของ RPC (migration 2a–2e + เฟส 3)
//   get_team_battle_setup       → SetupView        (ครูเท่านั้น)
//   get_team_battle_state       → BattleState      (ครู + สมาชิกห้อง; aggregate เท่านั้น)
//   tb_get_active_question      → ActiveQuestion   (เฉพาะผู้เล่นทีมรับ; ไม่มีเฉลย)
//   tb_tick                     → TickResult
// ไม่มี type ไหนในไฟล์นี้ที่ถือเฉลยของโจทย์

import type { PvpEffectId } from "@/lib/pvp/effects";

export type TeamId = "a" | "b";
export type BattleStatus = "setup" | "active" | "finished" | "abandoned";
export type BattlePhase = "picking" | "answering";
export type BattleOutcome = "a_win" | "b_win" | "draw";
export type EndedReason = "hp_zero" | "time_up" | "host_ended" | "stale_timeout" | "room_ended";
export type GradeBand = "primary" | "junior" | "senior";

export type BattleStats = { hp: number; atk: number; def: number; spd: number; foc: number };

/** config ที่ครูส่งให้ create_team_battle (normalize ฝั่ง DB: _tb_normalize_config) */
export type BattleConfig = {
  grade_band: GradeBand;
  subject: string;
  branch: string | null;
  chapters: string[];
  pick_seconds: number;
  answer_seconds: number;
  time_limit_minutes: number;
  rewards_enabled: boolean;
  eggs_enabled: boolean;
};

/** config ที่ get_team_battle_state คืน — ตัด chapters ออก */
export type BattleConfigPublic = Omit<BattleConfig, "chapters">;

// ---- ตั้งค่า (ครู) ----------------------------------------------------------

export type QuestionLevel = "ok" | "warn" | "block";
export type QuestionCount = { count: number; level: QuestionLevel };

export type CheckBlockCode = "team_too_small" | "mixed_band" | "questions_block";
export type CheckWarnCode = "team_size_diff" | "questions_low";

export type SetupChecks = {
  block: CheckBlockCode[];
  warn: CheckWarnCode[];
  players_a: number;
  players_b: number;
  question_count: number;
  can_start: boolean;
};

export type SetupMember = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  student_number: number | null;
  profile_grade_band: GradeBand | null;
  team: TeamId;
  is_player: boolean;
  stat: BattleStats;
  power: number;
  pet_nickname: string | null;
  pet_stage: number | null;
  pet_sprite_prefix: string | null;
};

export type SetupView = {
  battle: {
    id: string;
    status: BattleStatus;
    config: BattleConfig;
    started_at: string | null;
    ends_at: string | null;
  };
  checks: SetupChecks;
  members: SetupMember[];
};

// ---- สถานะเกม (ทุกคนในห้อง) -------------------------------------------------

/** การ์ดที่ลงสนามแล้ว (การ์ดที่ยังไม่ลงไม่ถูกเปิดเผยใน state) */
export type PlayedCard = {
  id: string;
  chapter: string;
  subject: string;
  difficulty: number;
  effect_id: PvpEffectId | null;
};

/** ผลต่อยก (แถว pvp_team_rounds ตัด battle_id) — aggregate ไม่มี user_id */
export type RoundResult = {
  round_no: number;
  attacker_team: TeamId;
  card_id: string | null;
  effect_id: PvpEffectId | null;
  defenders_total: number;
  correct_count: number;
  wrong_count: number;
  no_answer_count: number;
  damage: number;
  crit: boolean;
  effect_triggered: boolean;
  self_damage: number;
  heal_self: number;
  heal_defender: number;
  pierce: number;
  hp_a_after: number;
  hp_b_after: number;
  timed_out: boolean;
  resolved_at: string;
};

export type BattleSnapshot = {
  id: string;
  status: BattleStatus;
  phase: BattlePhase | null;
  current_round: number;
  attacker_team: TeamId | null;
  // ก่อนเริ่มเกม (setup) ค่าเหล่านี้เป็น null
  hp_a: number | null;
  hp_b: number | null;
  hp_max_a: number | null;
  hp_max_b: number | null;
  stat_a: BattleStats | null;
  stat_b: BattleStats | null;
  player_count_a: number | null;
  player_count_b: number | null;
  round_deadline: string | null;
  ends_at: string | null;
  outcome: BattleOutcome | null;
  ended_reason: EndedReason | null;
  config: BattleConfigPublic;
};

/** รูปตรงจาก get_team_battle_state — มี commander_user_id (ใช้บนมือถือเพื่อรู้ว่า "ฉันคือผู้บัญชาการ" เท่านั้น) */
export type BattleState = {
  battle: BattleSnapshot;
  round: {
    commander_user_id: string | null;
    defenders_total: number | null;
    /** จำนวนคนทีมรับที่ตอบแล้ว — ตัวเลขรวมเท่านั้น ไม่รู้ว่าใคร */
    answered: number;
    card: PlayedCard | null;
  };
  last_round: RoundResult | null;
  server_now: string;
};

/**
 * มุมมองสำหรับจอกลาง: ไม่มี user_id ใด ๆ ติดมา (มติ: จอกลางโชว์แค่ "ผู้บัญชาการทีม A/B")
 * จอกลางต้องรับ type นี้ ไม่ใช่ BattleState ดิบ
 */
export type CentralBattleView = Omit<BattleState, "round"> & {
  round: Omit<BattleState["round"], "commander_user_id">;
};

export function toCentralView(state: BattleState): CentralBattleView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { commander_user_id, ...round } = state.round;
  return { ...state, round };
}

// ---- ผู้เล่น ---------------------------------------------------------------

/** โจทย์ของยกที่กำลังตอบ — ไม่มี correct_index (อ่านเฉลยจากตาราง questions ตรงห้ามเด็ดขาด) */
export type ActiveQuestion = {
  round_no: number;
  question_id: number;
  question_text: string;
  choices: string[];
  image_url: string | null;
  effect_id: PvpEffectId | null;
  round_deadline: string;
  server_now: string;
};

/** การ์ดในมือผู้บัญชาการ — ไม่มี question_id โดยตั้งใจ (ไม่ select ออกมาเลย) */
export type MyHandCard = {
  id: string;
  chapter: string;
  subject: string;
  difficulty: number;
  effect_id: PvpEffectId | null;
};

export type MyMember = {
  team: TeamId;
  is_player: boolean;
  commander_order: number | null;
};

export type MyAnswer = {
  round_no: number;
  answer_index: number | null;
  is_correct: boolean;
  timed_out: boolean;
};

// ---- tick ------------------------------------------------------------------

export type TickAction = "none" | "wait" | "auto_pick" | "resolved" | "finished_no_cards";

export type TickRoundSummary =
  | { noop: true }
  | {
      round_no: number;
      defenders_total: number;
      correct: number;
      wrong: number;
      no_answer: number;
      damage: number;
      crit: boolean;
      effect_id: PvpEffectId | null;
      effect_triggered: boolean;
      self_damage: number;
      heal_self: number;
      heal_defender: number;
      hp_a: number;
      hp_b: number;
    };

export type TickResult = {
  action: TickAction;
  status?: BattleStatus;
  result?: TickRoundSummary;
};
