import { BASE_EXP_PER_CORRECT } from "./exp.ts";
import { STAGE_EXP_THRESHOLD } from "./evolution.ts";
import { resolveNextAction, type NextAction, type NextActionId } from "./nextAction.ts";

// หน้าแรก /pet ทาง A "เส้นทางวันนี้" — แปลงข้อมูลที่ pet/page.tsx ดึงอยู่แล้วเป็นจุดบนทาง (pure, ไม่ query เพิ่ม)
// จุด "ตอนนี้" มาจาก resolveNextAction() เท่านั้น — ทางเดินแค่แสดงทุกจุด ลำดับความสำคัญยังเป็นของ resolver

export type TrailStopId = "hatch" | "collect" | "mission" | "train" | "adventure" | "raid" | "pvp";
export type TrailStopStatus = "done" | "now" | "todo" | "wait" | "locked";

export type TrailStop = {
  id: TrailStopId;
  status: TrailStopStatus;
  title: string;
  detail: string;
};

export type HomeTrailInput = {
  stage: number;
  exp: number;
  expToday: number;
  dailyCap: number;
  mission: { id: string; answeredCount: number; correctCount: number; target: number; category: string | null; bonusExp: number } | null;
  dungeonStatus: "invite" | "ready" | "traveling" | "claimable";
  dungeonName?: string | null;
  adventureMinutes?: number | null;
  raidTicketCount: number;
  pvpTurnCount: number;
  advancedUnlocked: boolean;
  // จุดผจญภัย/ท้าทายเปิดไหม — ชุดเดียวกับที่ /adventure ใช้ตัดสิน redirect (มีรันค้าง หรือ getEligiblePets() ไม่ว่าง)
  // ไม่ส่ง = ใช้ advancedUnlocked (เทส/พรีวิว) · ป้อนเข้า resolveNextAction() ด้วย — ปุ่มหลักกับจุดบนทางใช้ค่าเดียวกัน
  adventureOpen?: boolean;
  hasEverAnswered?: boolean;
  weakTopic?: string | null;
};

export type HomeTrail = {
  // null = ไม่มีจุดไหนบนทางเป็น "ตอนนี้" (practice — ครบทุกจุดแล้ว / ทบทวน)
  nowId: TrailStopId | null;
  action: NextAction;
  stops: TrailStop[];
};

const ACTION_TO_STOP: Record<NextActionId, TrailStopId | null> = {
  hatch_pet: null,
  collect_evolution: "collect",
  daily_mission: "mission",
  train_to_cap: "train",
  claim_adventure: "adventure",
  start_adventure: "adventure",
  start_raid: "raid",
  resume_pvp: "pvp",
  practice: null,
};

// คำใต้จุดผจญภัย/ท้าทายตอนล็อก — ล็อกเพราะยังไม่มี Qmon ในฟาร์มที่ออกไปได้ (ไม่ใช่เพราะระยะของน้องตัวนี้)
const LOCKED_DETAIL = "เก็บเข้าฟาร์มก่อนนะ";

export function eggAnswersLeft(exp: number): number {
  return Math.max(0, Math.ceil((STAGE_EXP_THRESHOLD[1] - exp) / BASE_EXP_PER_CORRECT));
}

export function buildHomeTrail(input: HomeTrailInput): HomeTrail {
  const { stage, mission } = input;
  const isMaxStage = stage === 4;
  const missionActive = !!mission && mission.answeredCount < mission.target;

  const action = resolveNextAction({
    hasPet: true,
    evolutionReady: isMaxStage,
    mission: missionActive && mission
      ? { id: mission.id, remaining: mission.target - mission.answeredCount, bonusExp: mission.bonusExp, target: mission.target }
      : null,
    missionTopic: mission?.category ?? null,
    missionStarted: !!mission && mission.answeredCount > 0,
    adventureStatus: input.dungeonStatus,
    adventureMinutes: input.adventureMinutes ?? null,
    pvpTurnCount: input.pvpTurnCount,
    raidTicketCount: input.raidTicketCount,
    advancedActivitiesUnlocked: input.advancedUnlocked,
    adventureOpen: input.adventureOpen ?? input.advancedUnlocked,
    expToday: input.expToday,
    dailyExpCap: input.dailyCap,
    hasEverAnswered: input.hasEverAnswered,
    weakTopic: input.weakTopic ?? null,
  });
  const nowId = ACTION_TO_STOP[action.id];

  const stops: TrailStop[] = [];
  if (stage <= 2) {
    const left = eggAnswersLeft(input.exp);
    stops.push({
      id: "hatch",
      status: stage >= 2 ? "done" : "todo",
      title: "ออกจากไข่",
      detail: stage >= 2 ? "ผ่านแล้ว" : `ตอบถูกอีก ${left} ข้อ ไข่จะฟัก`,
    });
  }
  if (isMaxStage) {
    stops.push({ id: "collect", status: "todo", title: "เก็บเข้าฟาร์ม", detail: "น้องโตครบแล้ว" });
  }
  if (mission) {
    const done = mission.answeredCount >= mission.target;
    const left = mission.target - mission.answeredCount;
    stops.push({
      id: "mission",
      status: done ? "done" : "todo",
      title: "ภารกิจวันนี้",
      detail: done
        ? `สำเร็จ · ถูก ${mission.correctCount} จาก ${mission.target}`
        : mission.answeredCount > 0
          ? `ทำต่อ · อีก ${left} ข้อ`
          : `${mission.target} ข้อ · +${mission.bonusExp} EXP`,
    });
  }
  const expLeft = Math.max(0, input.dailyCap - Math.max(0, input.expToday));
  stops.push({
    id: "train",
    status: expLeft === 0 ? "done" : "todo",
    title: "ฝึกเพิ่ม",
    detail: expLeft === 0 ? `วันนี้ได้ครบ ${input.dailyCap} EXP แล้ว` : `วันนี้ยังได้อีก ${expLeft} EXP`,
  });

  const unlocked = input.adventureOpen ?? input.advancedUnlocked;
  const advDetail: Record<HomeTrailInput["dungeonStatus"], string> = {
    invite: LOCKED_DETAIL,
    ready: "พร้อมออกเดินทาง",
    traveling: input.dungeonName ? `กำลังเดินทาง · ${input.dungeonName}` : "กำลังเดินทาง",
    claimable: "กลับมาแล้ว รับของได้",
  };
  stops.push({
    id: "adventure",
    status: !unlocked ? "locked" : input.dungeonStatus === "traveling" ? "wait" : "todo",
    title: input.dungeonName && unlocked ? `ผจญภัย${input.dungeonName}` : "ผจญภัย",
    detail: unlocked ? advDetail[input.dungeonStatus] : advDetail.invite,
  });
  stops.push({
    id: "raid",
    status: !unlocked ? "locked" : input.raidTicketCount > 0 ? "todo" : "wait",
    title: "ท้าทายด่าน",
    detail: !unlocked
      ? LOCKED_DETAIL
      : input.raidTicketCount > 0
        ? `มีกุญแจ ${input.raidTicketCount} ดอก`
        : "หมดแล้ว · ได้จากการผจญภัย",
  });
  stops.push({
    id: "pvp",
    status: "todo",
    title: "ประลองกับเพื่อน",
    detail: input.pvpTurnCount > 0 ? `ถึงตาเล่น ${input.pvpTurnCount} เกม` : "ส่งโจทย์ให้เพื่อนตอบ",
  });

  for (const s of stops) if (s.id === nowId) s.status = "now";
  return { nowId, action, stops };
}

// กดจุดบนทาง — จุดเป็นทางลัดรอง ปุ่มหลักยังเป็นการ์ด "ตอนนี้" (HomeNowCard) จุดเดียว
// navigate.hard = ภารกิจ ต้อง window.location.assign เหมือนปุ่มหลัก (router.push เคยได้ /quiz ไม่มี ?mission=)
export type StopTap =
  | { kind: "navigate"; href: string; hard: boolean }
  | { kind: "collect" }
  | { kind: "sheet"; sheet: "growth" }
  | { kind: "locked"; message: string };

export type StopTapContext = { missionId: string | null; isGuest: boolean };

export const STOP_LOCK_MESSAGE = {
  farm: "เก็บเราเข้าฟาร์มก่อนนะ แล้วค่อยออกผจญภัยกัน",
  keys: "กุญแจหมดแล้ว ออกผจญภัยเพื่อหากุญแจกันนะ",
  guest: "เข้าสู่ระบบก่อนนะ แล้วเราจะไปผจญภัยด้วยกัน",
} as const;

export const STOP_ACTIVITY: Record<TrailStopId, "hatch" | "practice" | "mission" | "adventure" | "raid" | "pvp"> = {
  hatch: "hatch",
  collect: "hatch",
  mission: "mission",
  train: "practice",
  adventure: "adventure",
  raid: "raid",
  pvp: "pvp",
};

export function resolveStopTap(stop: TrailStop, ctx: StopTapContext): StopTap {
  switch (stop.id) {
    case "hatch":
      return { kind: "sheet", sheet: "growth" };
    case "collect":
      return { kind: "collect" };
    case "mission":
      if (stop.status === "done" || !ctx.missionId) return { kind: "navigate", href: "/quiz", hard: false };
      return { kind: "navigate", href: `/quiz?mission=${ctx.missionId}`, hard: true };
    case "train":
      return { kind: "navigate", href: "/quiz", hard: false };
    case "pvp":
      return { kind: "navigate", href: "/pvp", hard: false };
    case "adventure":
    case "raid":
      if (ctx.isGuest) return { kind: "locked", message: STOP_LOCK_MESSAGE.guest };
      if (stop.status === "locked") return { kind: "locked", message: STOP_LOCK_MESSAGE.farm };
      if (stop.id === "raid" && stop.status === "wait") return { kind: "locked", message: STOP_LOCK_MESSAGE.keys };
      return { kind: "navigate", href: stop.id === "raid" ? "/raid" : "/adventure", hard: false };
  }
}

export function stopTapOutcome(tap: StopTap): "navigate" | "sheet" | "locked_message" {
  return tap.kind === "sheet" ? "sheet" : tap.kind === "locked" ? "locked_message" : "navigate";
}

// ตัวช่วยพรีวิว ?trailPreview= (ไม่ใช่ production เท่านั้น — pet/page.tsx กันไว้) แทนข้อมูลจริงด้วยค่าสมมติ
// เฉพาะ input ของทางเดิน ไม่แตะ DB · ค่าตามต้นแบบ .oil-ui/home-trail/proto/app.js
export const TRAIL_PREVIEWS = ["egg", "mission", "train", "unlocked", "collect", "rest"] as const;
export type TrailPreview = (typeof TRAIL_PREVIEWS)[number];

export function parseTrailPreview(value: unknown): TrailPreview | null {
  return typeof value === "string" && (TRAIL_PREVIEWS as readonly string[]).includes(value) ? (value as TrailPreview) : null;
}

export function applyTrailPreview(real: HomeTrailInput, kind: TrailPreview): HomeTrailInput {
  const cap = real.dailyCap;
  const m = (answeredCount: number, correctCount = answeredCount) => ({
    id: real.mission?.id ?? "preview",
    answeredCount,
    correctCount,
    target: 5,
    category: real.mission?.category ?? "แรงและการเคลื่อนที่",
    bonusExp: real.mission?.bonusExp ?? 10,
  });
  const base = { ...real, adventureOpen: undefined, raidTicketCount: 0, pvpTurnCount: 0, advancedUnlocked: false, dungeonStatus: "invite" as const, dungeonName: null };
  switch (kind) {
    case "egg":
      return { ...base, stage: 1, exp: 20, expToday: 20, mission: m(3, 2) };
    case "mission":
      return { ...base, stage: 2, exp: 155, expToday: 60, mission: m(3) };
    case "train":
      return { ...base, stage: 2, exp: 230, expToday: Math.min(125, cap - 1), mission: m(5, 4) };
    case "unlocked":
      return { ...base, stage: 3, exp: 610, expToday: cap, mission: m(5), advancedUnlocked: true, dungeonStatus: "claimable", dungeonName: "ถ้ำน้ำแข็ง", raidTicketCount: 2, pvpTurnCount: 1 };
    case "collect":
      return { ...base, stage: 4, exp: 905, expToday: 90, mission: m(5, 4), advancedUnlocked: true, dungeonStatus: "ready", raidTicketCount: 1 };
    case "rest":
      return { ...base, stage: 3, exp: 610, expToday: cap, mission: m(5), advancedUnlocked: true, dungeonStatus: "traveling", dungeonName: "ถ้ำน้ำแข็ง" };
  }
}
