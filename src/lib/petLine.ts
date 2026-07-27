import type { Personality, Subline } from "@/lib/evolution";
import * as ev from "@/lib/evolution";

export type SeniorLine = "physics" | "chemistry" | "biology";
export type PetLine = Subline | SeniorLine; // 6 ค่า

/** สายจริง → เลนศิลป์/สเตตัส (ค่าที่ evolution.ts รู้จัก) — mapping ตามหมวด 4.2 */
const ART_LANE: Record<PetLine, Subline> = {
  math: "math",
  science: "science",
  balanced: "balanced",
  physics: "math", // ATK/FOC
  chemistry: "balanced", // สมดุล + SPD
  biology: "science", // HP/DEF
};

export const SENIOR_LINE_ORDER: SeniorLine[] = ["physics", "chemistry", "biology"];

export function artLane(line: PetLine): Subline {
  return ART_LANE[line];
}

/** แปลงค่าจาก DB (string) เป็น PetLine อย่างปลอดภัย — คืน null ถ้าไม่รู้จัก */
export function parsePetLine(v: string | null | undefined): PetLine | null {
  if (!v) return null;
  return v in ART_LANE ? (v as PetLine) : null;
}

/**
 * เลือกสายของ senior: สายที่ตอบถูกมากที่สุดชนะ · เสมอ = สุ่มในกลุ่มที่เสมอ
 * ถ้าไม่มีข้อมูลเลย (ทุกสาย 0) → เสมอ 3 ทาง → สุ่ม (ตามที่เคาะไว้: ไม่มีสาย fallback)
 */
export function resolveSeniorLine(counts: Partial<Record<SeniorLine, number>>): SeniorLine {
  const max = Math.max(...SENIOR_LINE_ORDER.map((l) => counts[l] ?? 0));
  const winners = SENIOR_LINE_ORDER.filter((l) => (counts[l] ?? 0) === max);
  return winners[Math.floor(Math.random() * winners.length)];
}

// ── wrapper ของ evolution.ts: caller ภายนอกเปลี่ยนแค่ import path ─────────────
export function getSpeciesName(
  spritePrefix: string,
  stage: number,
  line: PetLine | null,
  personality: Personality | null,
  eggNameTh: string
): string {
  return ev.getSpeciesName(spritePrefix, stage, line ? artLane(line) : null, personality, eggNameTh);
}

export function getSpeciesNameParts(
  spritePrefix: string,
  line: PetLine,
  personality: Personality
): { base: string; name: string } {
  return ev.getSpeciesNameParts(spritePrefix, artLane(line), personality);
}

export function getSublineBaseName(spritePrefix: string, line: PetLine): string {
  return ev.getSublineBaseName(spritePrefix, artLane(line));
}
