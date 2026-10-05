// Team Battle — ตรรกะล้วนของจอกลาง (ไม่แตะ React/DB)
// ทุกฟังก์ชันรับเฉพาะข้อมูลรวมของทีม — ไม่มี user_id/ชื่อ และไม่มีข้อมูลรายคนตอบผิด

import type { PvpEffectId } from "@/lib/pvp/effects";
import type { BattleConfigPublic, BattleOutcome, BattlePhase, EndedReason, RoundResult, TeamId } from "./types";

export const TEAM_NAME: Record<TeamId, string> = { a: "ทีม A", b: "ทีม B" };

export function defenderOf(attacker: TeamId): TeamId {
  return attacker === "a" ? "b" : "a";
}

/** สัดส่วน HP เป็นเปอร์เซ็นต์ 0–100 */
export function hpPercent(hp: number | null | undefined, max: number | null | undefined): number {
  const m = Math.max(max ?? 0, 1);
  const h = Math.max(hp ?? 0, 0);
  return Math.min(100, (h / m) * 100);
}

/** m:ss ของ ms ที่เหลือ (ติดลบ/ไม่จำกัด → 0:00 / –) */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** ความยาวของช่วงนั้น (ms) — ตรงกับที่ DB ตั้ง: haste = ครึ่งหนึ่งของเวลาตอบ (ขั้นต่ำ 5 วิ) */
export function phaseTotalMs(
  config: Pick<BattleConfigPublic, "pick_seconds" | "answer_seconds">,
  phase: BattlePhase | null,
  effectId: PvpEffectId | null | undefined
): number {
  if (phase === "picking") return config.pick_seconds * 1000;
  if (phase === "answering") {
    const secs = effectId === "haste" ? Math.max(5, Math.floor(config.answer_seconds / 2)) : config.answer_seconds;
    return secs * 1000;
  }
  return 0;
}

/** สัดส่วนเวลาที่เหลือ 0–1 (ไว้วาดแถบ) */
export function timeLeftFraction(msLeft: number, totalMs: number): number {
  if (!Number.isFinite(msLeft) || totalMs <= 0) return 0;
  return Math.min(1, Math.max(0, msLeft / totalMs));
}

export const EFFECT_NOTE: Record<PvpEffectId, string> = {
  reprisal: "ถ้าตอบถูก ดาเมจบางส่วนจะสะท้อนกลับไปที่ทีมที่ส่งการ์ด",
  pierce: "ต่อให้ตอบถูก ก็ยังโดนดาเมจเจาะเกราะเล็กน้อย",
  heal: "ถ้าตอบถูก ทีมที่ตอบได้พลังชีวิตคืน",
  high_stake: "ถ้ามีคนยังตอบไม่ถูก ดาเมจเพิ่มเป็น 2 เท่า",
  lifesteal: "ถ้ามีคนยังตอบไม่ถูก ทีมที่ส่งการ์ดดูดพลังชีวิตคืน",
  haste: "เวลาตอบเหลือครึ่งหนึ่ง",
};

export function effectNote(id: string | null | undefined): string | null {
  if (!id) return null;
  return (EFFECT_NOTE as Record<string, string>)[id] ?? null;
}

export function phaseHeadline(attacker: TeamId | null, phase: BattlePhase | null): string {
  if (!attacker || !phase) return "กำลังเตรียมยกต่อไป";
  if (phase === "picking") return `ผู้บัญชาการ${TEAM_NAME[attacker]}กำลังเลือกการ์ด`;
  return `${TEAM_NAME[defenderOf(attacker)]}กำลังตอบคำถาม`;
}

export type RoundNarration = {
  headline: string;
  /** สัดส่วนผู้ตอบ (รวม 100) สำหรับแถบ: ถูก / ยังไม่ถูก / ไม่ได้ตอบ */
  split: { correct: number; wrong: number; none: number };
  lines: string[];
};

/** คำบรรยายผลยก — เฉพาะตัวเลขรวม น้ำเสียงเชิงบวก ไม่มีชื่อใคร */
export function narrateRound(r: RoundResult): RoundNarration {
  const att = TEAM_NAME[r.attacker_team];
  const def = TEAM_NAME[defenderOf(r.attacker_team)];
  const total = Math.max(r.defenders_total, 1);
  const lines: string[] = [];

  if (r.damage > 0) {
    lines.push(`${def}โดน ${r.damage}${r.crit ? " (คริติคอล!)" : ""}`);
  } else {
    lines.push(`${def}รับมือได้ครบ ไม่โดนดาเมจเลย!`);
  }
  if (r.self_damage > 0) lines.push(`${att}โดนสะท้อนกลับ ${r.self_damage}`);
  if (r.heal_self > 0) lines.push(`${att}ได้พลังชีวิตคืน ${r.heal_self}`);
  if (r.heal_defender > 0) lines.push(`${def}ได้พลังชีวิตคืน ${r.heal_defender}`);
  if (r.timed_out && r.no_answer_count > 0) lines.push("หมดเวลาแล้ว ปิดยกให้อัตโนมัติ");

  return {
    headline: `ผลยกที่ ${r.round_no}`,
    split: {
      correct: (r.correct_count / total) * 100,
      wrong: (r.wrong_count / total) * 100,
      none: (r.no_answer_count / total) * 100,
    },
    lines,
  };
}

/** หัวข้อตอนจบเกม — ชื่นชมทุกทีม ไม่มีคำว่าแพ้ */
export function outcomeHeadline(outcome: BattleOutcome | null, abandoned: boolean): string {
  if (abandoned) return "เกมนี้ถูกปิดแล้ว";
  if (outcome === "draw") return "เสมอกัน! ทั้งสองทีมเก่งมาก";
  if (outcome === "a_win") return `${TEAM_NAME.a}ได้คะแนนนำเมื่อจบเกม — ทุกคนทำได้ดีมาก`;
  if (outcome === "b_win") return `${TEAM_NAME.b}ได้คะแนนนำเมื่อจบเกม — ทุกคนทำได้ดีมาก`;
  return "จบเกมแล้ว";
}

export function endedReasonText(reason: EndedReason | null): string | null {
  if (reason === "hp_zero") return "พลังชีวิตของอีกทีมหมดลงแล้ว";
  if (reason === "time_up") return "หมดเวลาเกม";
  if (reason === "host_ended") return "ครูจบเกม";
  return null;
}
