// PvP ประลอง — สไลซ์ 4: ใช้ raid_gear_items ตัวเดิม ไม่มีระบบอุปกรณ์แยก
// โบนัสอุปกรณ์ฝั่ง client (โชว์ preview เท่านั้น — ค่าจริงอยู่ใน accept_pvp_challenge SQL snapshot)
// FOC ไม่รับโบนัส (ตรงกับ raid — raid_gear_items ยอมแค่ atk/hp/def/spd)

import type { RaidGearItemFull } from "@/lib/raid";

export type PvpGearStatKey = "hp" | "atk" | "def" | "spd";

export function pvpGearBonus(
  items: RaidGearItemFull[],
  petId: string
): Record<PvpGearStatKey, number> {
  const b: Record<PvpGearStatKey, number> = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const it of items) {
    if (it.equippedPetId !== petId) continue;
    if (it.mainStat in b) b[it.mainStat as PvpGearStatKey] += it.mainValue;
    if (it.subStat && it.subValue && it.subStat in b) {
      b[it.subStat as PvpGearStatKey] += it.subValue;
    }
  }
  return b;
}
