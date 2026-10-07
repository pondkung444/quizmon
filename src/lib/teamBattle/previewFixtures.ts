// Team Battle — ข้อมูลจำลองสำหรับหน้า preview dev-only (/teacher/preview/battle)
// ป้อนเข้า BattleCentral โดยตรง ไม่แตะ DB/RPC/realtime; ไม่มีชื่อรายคน/user_id ใดๆ
// เปิดได้เฉพาะ dev + RAID_CARD_PREVIEW=true (flag เดียวกับ /raid/preview)

import type { PvpEffectId } from "@/lib/pvp/effects";
import type { CentralRoster, CentralRosterMember } from "./centralRoster";
import type {
  BattleOutcome,
  BattleSnapshot,
  CentralBattleView,
  EndedReason,
  RoundResult,
  TeamId,
} from "./types";
import type { ClockEstimator } from "./useServerClock";

export type PreviewScenario = "picking" | "answering" | "result" | "finished" | "abandoned";

export const PREVIEW_SCENARIOS: { id: PreviewScenario; label: string }[] = [
  { id: "picking", label: "เลือกการ์ด" },
  { id: "answering", label: "กำลังตอบ" },
  { id: "result", label: "ผลยก (เลขลอยครบ 4 แบบ)" },
  { id: "finished", label: "จบเกม" },
  { id: "abandoned", label: "เกมถูกปิด (abandoned)" },
];

export const PREVIEW_EFFECTS: PvpEffectId[] = ["reprisal", "pierce", "heal", "high_stake", "lifesteal", "haste"];
export const PREVIEW_OUTCOMES: BattleOutcome[] = ["a_win", "b_win", "draw"];
export const PREVIEW_REASONS: EndedReason[] = ["hp_zero", "time_up", "host_ended", "stale_timeout", "room_ended"];

/** ขนาดทีมในหน้า preview: "none" = ไม่ส่ง roster (ทดสอบของเดิม), "11v10" = ทีมไม่เท่ากัน */
export const PREVIEW_SIZES = ["none", "3", "10", "16", "20", "30", "11v10"] as const;
export type PreviewSize = (typeof PREVIEW_SIZES)[number];
const SIZE_COUNTS: Record<Exclude<PreviewSize, "none">, [number, number]> = {
  "3": [3, 3],
  "10": [10, 10],
  "16": [16, 16],
  "20": [20, 20],
  "30": [30, 30],
  "11v10": [11, 10],
};

export type PreviewParams = {
  size?: PreviewSize;
  scenario: PreviewScenario;
  effect: PvpEffectId | null;
  outcome: BattleOutcome;
  reason: EndedReason;
};

export const PREVIEW_DEFAULTS: PreviewParams = {
  size: "20",
  scenario: "answering",
  effect: "reprisal",
  outcome: "a_win",
  reason: "hp_zero",
};

/** dev เท่านั้น + ต้องตั้ง RAID_CARD_PREVIEW=true (แบบเดียวกับ /raid/preview) */
export function isBattlePreviewEnabled(nodeEnv: string | undefined, flag: string | undefined): boolean {
  return nodeEnv !== "production" && flag === "true";
}

function pick<T extends string>(raw: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return allowed.find((a) => a === v) ?? fallback;
}

export function parsePreviewParams(sp: Record<string, string | string[] | undefined>): PreviewParams {
  const effectRaw = Array.isArray(sp.effect) ? sp.effect[0] : sp.effect;
  return {
    size: pick(sp.size, PREVIEW_SIZES, "20"),
    scenario: pick(sp.scenario, PREVIEW_SCENARIOS.map((s) => s.id), PREVIEW_DEFAULTS.scenario),
    effect: effectRaw === "none" ? null : pick(sp.effect, PREVIEW_EFFECTS, PREVIEW_DEFAULTS.effect!),
    outcome: pick(sp.outcome, PREVIEW_OUTCOMES, PREVIEW_DEFAULTS.outcome),
    reason: pick(sp.reason, PREVIEW_REASONS, PREVIEW_DEFAULTS.reason),
  };
}

const ROUND_DEADLINE = "2026-10-06T00:00:30.000Z";
const GAME_END = "2026-10-06T00:08:23.000Z";

/** นาฬิกาแช่แข็ง: ช่วงยก 0:17, เวลาทั้งเกม 8:23 — ให้ภาพนิ่งเทียบความละเอียดได้ */
export const PREVIEW_CLOCK: ClockEstimator = {
  recordSample() {},
  serverNow: () => 0,
  msUntil: (d) => (d === GAME_END ? 503_000 : d ? 17_000 : Infinity),
  offsetMs: () => 0,
  sampleCount: () => 0,
};

/** ผลยกที่มีตัวเลขครบทุกแบบพร้อมกัน (ไว้ทดสอบเลย์เอาต์ — ในเกมจริงเอฟเฟกต์เหล่านี้ไม่เกิดพร้อมกัน) */
function fullRound(roundNo: number, attacker: TeamId): RoundResult {
  return {
    round_no: roundNo,
    attacker_team: attacker,
    card_id: "preview-card",
    effect_id: null,
    defenders_total: 20,
    correct_count: 8,
    wrong_count: 9,
    no_answer_count: 3,
    damage: 63,
    crit: true,
    effect_triggered: true,
    self_damage: 15,
    heal_self: 20,
    heal_defender: 12,
    pierce: 6,
    hp_a_after: 740,
    hp_b_after: 420,
    timed_out: false,
    resolved_at: "2026-10-06T00:00:00.000Z",
  };
}

const CONFIG: BattleSnapshot["config"] = {
  grade_band: "junior",
  subject: "math",
  branch: null,
  pick_seconds: 15,
  answer_seconds: 30,
  time_limit_minutes: 10,
  rewards_enabled: false,
  eggs_enabled: false,
};

function previewCounts(size: PreviewSize = "20"): [number, number] {
  return size === "none" ? [20, 20] : SIZE_COUNTS[size];
}

// รูปจริงในซอร์ส: egg1–egg6 × stage 2/3/4; ผสม "ไม่มีคู่หู" (src null) และไฟล์ที่ไม่มีอยู่จริง (onError → ช่อง Q)
const PREVIEW_IMAGES: (string | null)[] = [
  "/pets/egg1_stage4_math_A.png",
  "/pets/egg2_stage4_science_B.png",
  "/pets/egg3_stage4_balance_A.png",
  "/pets/egg4_stage3_math.png",
  "/pets/egg5_stage3_science.png",
  "/pets/egg6_stage3_balance.png",
  "/pets/egg1_stage2_baby.png",
  "/pets/egg2_stage2_baby.png",
  "/pets/egg3_stage4_science_B.png",
  "/pets/egg4_stage4_balance_B.png",
  null, // ไม่มี pet (stat คงที่ 50)
  "/pets/_preview_missing_image.png", // ไฟล์ไม่มีอยู่จริง → ดูอาการรูปโหลดไม่ได้
];

function previewTeam(team: TeamId, n: number): CentralRosterMember[] {
  const offset = team === "a" ? 0 : 5;
  return Array.from({ length: n }, (_, i) => ({
    key: i,
    team,
    src: PREVIEW_IMAGES[(i * 5 + offset) % PREVIEW_IMAGES.length],
  }));
}

/** roster จำลอง (ไม่มีชื่อ/id) — ลำดับตรงกับที่ toCentralRoster ส่งไม่จำเป็น (หน้า preview ไม่ผ่านตัว join) */
export function buildPreviewRoster(size: PreviewSize = "20"): CentralRoster | null {
  if (size === "none") return null;
  const [na, nb] = SIZE_COUNTS[size];
  return { a: previewTeam("a", na), b: previewTeam("b", nb) };
}

export function buildPreviewView(p: PreviewParams, opts: { lastRoundNo?: number } = {}): CentralBattleView {
  const live = p.scenario === "picking" || p.scenario === "answering" || p.scenario === "result";
  const attacker: TeamId = p.scenario === "answering" ? "b" : "a";
  const phase = p.scenario === "answering" ? "answering" : live ? "picking" : null;
  const status = live ? "active" : p.scenario === "abandoned" ? "abandoned" : "finished";
  const outcome: BattleOutcome | null = p.scenario === "finished" ? p.outcome : null;
  const reason: EndedReason | null =
    p.scenario === "finished" ? p.reason : p.scenario === "abandoned" ? "stale_timeout" : null;

  const battle: BattleSnapshot = {
    id: "preview",
    status,
    phase,
    current_round: 5,
    attacker_team: live ? attacker : null,
    hp_a: 740,
    hp_b: 420,
    hp_max_a: 1000,
    hp_max_b: 1000,
    stat_a: null,
    stat_b: null,
    player_count_a: previewCounts(p.size)[0],
    player_count_b: previewCounts(p.size)[1],
    round_deadline: live ? ROUND_DEADLINE : null,
    ends_at: live ? GAME_END : null,
    outcome,
    ended_reason: reason,
    config: CONFIG,
  };

  return {
    battle,
    round: {
      defenders_total: p.scenario === "answering" ? 20 : null,
      answered: p.scenario === "answering" ? 11 : 0,
      card:
        p.scenario === "answering"
          ? {
              id: "preview-card",
              chapter: "สมการเชิงเส้นตัวแปรเดียวและการแก้โจทย์ปัญหา",
              subject: "math",
              difficulty: 3,
              effect_id: p.effect,
            }
          : null,
    },
    last_round: fullRound(opts.lastRoundNo ?? 4, "a"),
    server_now: "2026-10-06T00:00:00.000Z",
  };
}
