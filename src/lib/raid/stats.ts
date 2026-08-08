import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RaidStatKey = "hp" | "atk" | "def" | "spd" | "foc";

export type RaidStatRecord = Record<RaidStatKey, number>;

export type PetForStats = {
  stat_hp: number | null;
  stat_atk: number | null;
  stat_def: number | null;
  stat_spd: number | null;
  stat_foc: number | null;
};

const STAT_COLUMN: Record<RaidStatKey, keyof PetForStats> = {
  hp: "stat_hp",
  atk: "stat_atk",
  def: "stat_def",
  spd: "stat_spd",
  foc: "stat_foc",
};

// สไลซ์ 1: ยังไม่มี equip เลยคืน raw + 0 เสมอ (equippedGear รับไว้เฉยๆ ไม่ใช้ เผื่อ signature พร้อม
// สไลซ์ 2 ที่จะแก้ฟังก์ชันนี้ที่เดียว) ทุกจุดที่อ่านค่า stat ของ raid ต้องเรียกผ่านฟังก์ชันนี้เท่านั้น
// ห้ามอ่าน pet.stat_* ตรงๆ — clamp ไม่ให้เกิน cap ของไข่ตัวนั้นเสมอ (กฎเหล็ก: อุปกรณ์ดันได้ถึง cap
// เท่านั้น) แม้สไลซ์นี้จะยังไม่มีอุปกรณ์ที่ดันเกิน raw ได้จริงก็ตาม
export function effectiveStat(
  pet: PetForStats,
  stat: RaidStatKey,
  caps: RaidStatRecord,
  equippedGear: unknown[] = []
): number {
  void equippedGear;
  const raw = pet[STAT_COLUMN[stat]] ?? 0;
  return Math.min(raw, caps[stat]);
}

export async function capsFor(supabase: SupabaseServerClient, eggTypeId: string): Promise<RaidStatRecord> {
  const { data } = await supabase.from("egg_types").select("stat_profile").eq("id", eggTypeId).single();
  const caps = (data?.stat_profile as { caps?: RaidStatRecord } | null)?.caps;
  if (!caps) throw new Error(`ไม่พบ cap ของไข่ ${eggTypeId}`);
  return caps;
}

// ผลรวม 5 แกน ÷ 500 × 100 — 500 คือผลรวม cap ที่เท่ากันทุกไข่ (ยืนยันแล้วในดีไซน์ดอค) ไม่ใช่ตัวเลข
// สมดุลที่ต้องปรับได้ จึง hardcode ตรงนี้ได้ตรงกับที่ SQL ฝั่ง answer_raid_boss ใช้เหมือนกัน
export function totalPct(statSnapshot: RaidStatRecord): number {
  const sum = statSnapshot.hp + statSnapshot.atk + statSnapshot.def + statSnapshot.spd + statSnapshot.foc;
  return (sum / 500) * 100;
}

export type RollDisplay = { displayNeed: number; displayRoll: number };

// การแสดงผลของการทอยเท่านั้น — ไม่แตะตรรกะตัดสินผ่าน/ไม่ผ่านเลย (roll_passed จาก DB ยังเป็นความจริง
// สุดท้ายเสมอ) DB เก็บ roll_value < roll_threshold = ผ่าน (ยิ่งทอยได้น้อยยิ่งดี ซึ่งขัดสัญชาตญาณเกม
// ทอยเต๋าทั่วไป) กลับด้านเป็น "ทอยให้ได้มากกว่า N ถึงจะผ่าน" แบบ D&D DC แทน — สูตร:
//   displayNeed = 100 − thresholdScaled, displayRoll = 100 − valueScaled, ผ่านเมื่อ displayRoll > displayNeed
// จุดเดียวที่คำนวณนี้ (เรียกทั้งจาก action ตอนทอยสดและ read layer ตอน resume) กัน component แต่ละตัว
// กลับด้านเองไม่ตรงกัน — มี guard กันกรณี round() สองรอบชนกันจนตัวเลขขัดกับ rollPassed จริง (เช่น
// ปัดแล้ว displayRoll == displayNeed พอดีทั้งที่ผ่านจริง) โดยยึด rollPassed จาก DB เป็นความจริงเสมอ
// แล้วดันตัวเลขให้สอดคล้องตาม ไม่ใช่ทางกลับกัน
export function computeRollDisplay(
  valueScaled: number,
  thresholdScaled: number,
  rollPassed: boolean
): RollDisplay {
  const displayNeed = 100 - thresholdScaled;
  let displayRoll = 100 - valueScaled;
  if (rollPassed && displayRoll <= displayNeed) displayRoll = Math.min(100, displayNeed + 1);
  if (!rollPassed && displayRoll > displayNeed) displayRoll = displayNeed;
  return { displayNeed, displayRoll };
}
