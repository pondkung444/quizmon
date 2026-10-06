// Team Battle — ตรรกะล้วนฝั่งนักเรียน (มือถือ): หา role, เลือกหน้าจอ, กรองมือ, overlay ผลยก, redirect จาก lobby
// ไม่แตะ React/DB — ทดสอบด้วย tests/team-battle/student.test.ts
// ข้อความทั้งหมดอยู่ใน STUDENT_TEXT (มี test ว่าไม่มีคำว่าแพ้/ผิดพลาด/ล้มเหลว/ตอบผิด)

import type { BattlePhase, BattleStatus, MyAnswer, MyHandCard, MyMember, TeamId } from "./types";
import type { PvpEffectId } from "@/lib/pvp/effects";

// ---- role ------------------------------------------------------------------

export type StudentRole = {
  /** ทีมของฉัน (null ถ้าไม่มีแถวสมาชิก) */
  team: TeamId | null;
  /** ผู้เล่นจริงหรือไม่ (ไม่มีแถว/ถูกตัดเป็นผู้ชม = false) */
  isPlayer: boolean;
  isCommander: boolean;
  /** อยู่ทีมโจมตีของยกนี้ */
  isAttackerTeam: boolean;
  /** เป็นผู้เล่นทีมรับของยกนี้ (ต้องตอบ) */
  isDefender: boolean;
};

export function deriveRole(input: {
  myId: string;
  member: MyMember | null;
  attackerTeam: TeamId | null;
  commanderUserId: string | null;
}): StudentRole {
  const { myId, member, attackerTeam, commanderUserId } = input;
  const isPlayer = !!member && member.is_player;
  const team = member?.team ?? null;
  const isAttackerTeam = isPlayer && !!attackerTeam && team === attackerTeam;
  return {
    team,
    isPlayer,
    isCommander: isPlayer && !!commanderUserId && commanderUserId === myId,
    isAttackerTeam,
    isDefender: isPlayer && !!attackerTeam && team !== null && team !== attackerTeam,
  };
}

// ---- เลือกหน้าจอ -----------------------------------------------------------

export type StudentScreen =
  | "waiting_setup" //          ครูกำลังเตรียมทีม
  | "spectator" //              ผู้ชม (ไม่มีแถว/is_player=false)
  | "commander_pick" //         ผู้บัญชาการเลือกการ์ด
  | "wait_pick_attacker" //     ทีมโจมตี (ไม่ใช่ผู้บัญชาการ) รอผู้บัญชาการ
  | "wait_pick_defender" //     ทีมรับ รอทีมตรงข้ามเลือกการ์ด
  | "answer" //                 ผู้เล่นทีมรับ ยังไม่ตอบ
  | "answered_wait" //          ผู้เล่นทีมรับ ตอบแล้ว
  | "attacker_watch" //         ทีมโจมตีดูการ์ด + ตัวนับ answered
  | "preparing" //             ช่วงคาบเกี่ยว (ไม่มี phase)
  | "ended";

export function chooseScreen(input: {
  status: BattleStatus;
  phase: BattlePhase | null;
  role: StudentRole;
  /** ตอบยกนี้ไปแล้วหรือยัง (รู้จากตอนส่ง/ตอนเช็กของตัวเอง) */
  answeredThisRound: boolean;
}): StudentScreen {
  const { status, phase, role, answeredThisRound } = input;
  if (status === "finished" || status === "abandoned") return "ended";
  if (status === "setup") return "waiting_setup";
  if (!role.isPlayer) return "spectator";
  if (phase === "picking") {
    if (role.isCommander) return "commander_pick";
    return role.isAttackerTeam ? "wait_pick_attacker" : "wait_pick_defender";
  }
  if (phase === "answering") {
    if (role.isDefender) return answeredThisRound ? "answered_wait" : "answer";
    return "attacker_watch";
  }
  return "preparing";
}

// ---- มือการ์ด --------------------------------------------------------------

export type HandRow = MyHandCard & { round_no: number; played_at: string | null };

/** กรองมือ: เฉพาะยกปัจจุบัน และใบที่ยังไม่ลงสนาม (policy ของตารางอ่านมือยกเก่าได้ จึงกรองซ้ำฝั่ง client) */
export function filterHand(rows: HandRow[], currentRound: number): MyHandCard[] {
  return rows
    .filter((r) => r.round_no === currentRound && r.played_at === null)
    .map((r) => ({
      id: r.id,
      chapter: r.chapter,
      subject: r.subject,
      difficulty: r.difficulty,
      effect_id: (r.effect_id ?? null) as PvpEffectId | null,
    }));
}

export const HAND_RETRY_MS = 800;

// ---- overlay ผลยก ----------------------------------------------------------

export const RESULT_OVERLAY_MS = 3500;

export type OverlayState = {
  /** round_no ที่เห็นล่าสุด; undefined = ยังไม่เคยโหลด state (ยังไม่มี baseline) */
  seen: number | null | undefined;
  shownAt: number | null;
};

export const OVERLAY_INITIAL: OverlayState = { seen: undefined, shownAt: null };

/** โหลดครั้งแรก = ตั้ง baseline ไม่โชว์; หลังจากนั้นเมื่อ round_no เปลี่ยน = เริ่มโชว์ */
export function reduceOverlay(prev: OverlayState, lastRoundNo: number | null, now: number): OverlayState {
  if (prev.seen === undefined) return { seen: lastRoundNo, shownAt: null };
  if (prev.seen === lastRoundNo) return prev;
  return { seen: lastRoundNo, shownAt: lastRoundNo === null ? null : now };
}

export function overlayVisible(s: OverlayState, now: number): boolean {
  return s.shownAt !== null && now - s.shownAt < RESULT_OVERLAY_MS;
}

/** ข้อความของฉันในยกที่เพิ่งปิด (เฉพาะมือถือตัวเอง — ไม่มีเฉลย ไม่มีชื่อคนอื่น) */
export function answerFeedback(mine: MyAnswer | null): string | null {
  if (!mine) return null;
  if (mine.timed_out) return STUDENT_TEXT.feedbackTimedOut;
  return mine.is_correct ? STUDENT_TEXT.feedbackCorrect : STUDENT_TEXT.feedbackNotYet;
}

// ---- poll ตัวนับ answered --------------------------------------------------

export const ANSWERED_POLL_BASE_MS = 4000;
export const ANSWERED_POLL_JITTER_MS = 1000;

/** ~4 วิ ± 1 วิ (rand ∈ [0,1)) */
export function answeredPollDelay(rand: number): number {
  return ANSWERED_POLL_BASE_MS + (rand * 2 - 1) * ANSWERED_POLL_JITTER_MS;
}

// ---- redirect จาก lobby ----------------------------------------------------

/** พาเข้าหน้า battle เฉพาะเกมที่ยังเปิดอยู่ — เกมจบ/ปิด/ไม่พบ = ห้ามพา (ห้องค้าง team_battle + pointer เก่า จะวนลูป) */
export function shouldRedirectToBattle(status: string | null | undefined): boolean {
  return status === "setup" || status === "active";
}

// ---- ข้อความ ---------------------------------------------------------------

export const STUDENT_TEXT = {
  waitingSetup: "ครูกำลังเตรียมทีม รอสักครู่นะ",
  youAreOnTeam: (t: TeamId) => `คุณอยู่ทีม ${t.toUpperCase()}`,
  spectator: "คุณกำลังดูอยู่ — ครั้งหน้าร่วมเล่นได้นะ",
  commanderTitle: "คุณคือผู้บัญชาการ!",
  commanderHint: "เลือกการ์ด 1 ใบให้ทีมตรงข้ามตอบ",
  commanderSend: "ส่งการ์ดนี้",
  commanderSent: "ส่งการ์ดแล้ว!",
  commanderSentHint: "รอทีมตรงข้ามตอบคำถามนะ",
  handLoading: "กำลังเตรียมการ์ดของคุณ…",
  handEmpty: "ยังไม่พบการ์ด ลองรอสักครู่ หรือกดตรวจอีกครั้ง",
  handRetry: "ตรวจอีกครั้ง",
  waitPickAttacker: "ผู้บัญชาการทีมเรากำลังเลือกการ์ด",
  waitPickDefender: "ทีมตรงข้ามกำลังเลือกการ์ด เตรียมตัวนะ",
  attackerWatch: "ทีมของคุณส่งการ์ดแล้ว ลุ้นเพื่อนๆ ฝั่งตรงข้ามตอบนะ",
  answeredWait: "ส่งคำตอบแล้ว รอเพื่อนๆ",
  answerLoading: "กำลังโหลดโจทย์…",
  answeredAlready: "ส่งคำตอบไปแล้ว",
  timeUp: "หมดเวลาของยกนี้แล้ว",
  feedbackCorrect: "ข้อนี้คุณตอบถูก",
  feedbackNotYet: "ข้อนี้ยังไม่ถูก ลุยข้อต่อไป!",
  feedbackTimedOut: "ข้อนี้หมดเวลาก่อน ลุยข้อต่อไปนะ",
  preparing: "กำลังเตรียมยกต่อไป…",
  backToRoom: "กลับห้องเรียน",
  closeResult: "ปิด",
  loading: "กำลังโหลดเกม…",
  loadFailed: "โหลดเกมไม่สำเร็จ",
  retry: "ลองอีกครั้ง",
  teamLabel: (t: TeamId) => `ทีม ${t.toUpperCase()}`,
  answeredCount: (n: number, total: number) => `ส่งคำตอบแล้ว ${n}/${total} คน`,
  lobbyGoing: "กำลังพาเข้า Team Battle…",
} as const;

/** ข้อความทั้งหมดของฝั่งนักเรียน (ไว้ให้ test ตรวจคำต้องห้าม) */
export function allStudentTexts(): string[] {
  const fixed = (Object.values(STUDENT_TEXT) as unknown[]).filter((v): v is string => typeof v === "string");
  return [
    ...fixed,
    STUDENT_TEXT.youAreOnTeam("a"),
    STUDENT_TEXT.teamLabel("b"),
    STUDENT_TEXT.answeredCount(1, 5),
  ];
}
