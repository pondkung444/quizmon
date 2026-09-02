import { getPetImagePath } from "@/lib/petImage";
import { parsePetLine } from "@/lib/petLine";
import type { Personality } from "@/lib/evolution";

// รูปแบบแถวจาก RPC get_boss_raid_participant_display (20260901170000)
export type ParticipantDisplayRow = {
  participant_id: string;
  display_name: string;
  sprite_prefix: string | null;
  stage: number | null;
  subline: string | null;
  personality: string | null;
};

export type ParticipantDisplay = { name: string; sprite: string | null };

// resolve sprite path ผ่าน src/lib/petImage.ts (single source of truth เดียวของโปรเจกต์ — รวม gotcha
// "balanced" -> "balance" ที่ documented ไว้ในนั้น) คืน null ถ้าข้อมูลไม่ครบ/นอกช่วง (เช่น pet ต่ำกว่า
// stage 3 ที่ยังไม่มี subline/personality, หรือ stage เกิน 4) — ให้ caller ใส่ fallback sprite เอง
export function resolveParticipantSprite(row: ParticipantDisplayRow): string | null {
  if (!row.sprite_prefix || row.stage == null) return null;
  const personality: Personality | null =
    row.personality === "A" || row.personality === "B" ? row.personality : null;
  try {
    return getPetImagePath(row.sprite_prefix, row.stage, parsePetLine(row.subline), personality);
  } catch {
    return null;
  }
}

export function toParticipantDisplayMap(
  rows: ParticipantDisplayRow[]
): Map<string, ParticipantDisplay> {
  return new Map(
    rows.map((r) => [r.participant_id, { name: r.display_name, sprite: resolveParticipantSprite(r) }])
  );
}
