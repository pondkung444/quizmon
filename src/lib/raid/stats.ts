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

export type EquippedGearForStats = {
  slot: "head" | "body" | "feet";
  qualityLabel: string | null;
  mainStat: Exclude<RaidStatKey, "foc">;
  mainValue: number;
  subStat: Exclude<RaidStatKey, "foc"> | null;
  subValue: number | null;
};

// สไลซ์ 2: ค่าโบนัสจากของที่ equipped_pet_id ตรงกับ pet ตัวนี้ (main_value + sub_value ต่อแกน)
// บวกเข้า raw ก่อน clamp ไม่ให้เกิน cap ของไข่ตัวนั้น (กฎเหล็ก: อุปกรณ์ดันได้ถึง cap เท่านั้น)
// ใช้แสดงผล readiness ก่อนเริ่มรอบเท่านั้น — ตัวเลขจริงที่ตัดสินผ่าน/ไม่ผ่านมาจาก stat_snapshot
// ที่ start_raid_run คำนวณเองฝั่ง SQL (ล็อกตอนรอบเริ่ม ไม่อ่านสดระหว่างรอบ) ห้ามอ่าน pet.stat_* ตรงๆ
// นอกจากผ่านฟังก์ชันนี้
export function effectiveStat(
  pet: PetForStats,
  stat: RaidStatKey,
  caps: RaidStatRecord,
  equippedGear: EquippedGearForStats[] = []
): number {
  const raw = pet[STAT_COLUMN[stat]] ?? 0;
  const bonus = equippedGear.reduce((sum, gear) => {
    let add = 0;
    if (gear.mainStat === stat) add += gear.mainValue;
    if (gear.subStat === stat && gear.subValue) add += gear.subValue;
    return sum + add;
  }, 0);
  return Math.min(raw + bonus, caps[stat]);
}

export type GearContributionRow = {
  slot: "head" | "body" | "feet";
  qualityLabel: string | null;
  stat: Exclude<RaidStatKey, "foc">;
  addition: number;
  before: number;
  after: number;
  overflow: number;
};

const SLOT_ORDER: Array<"head" | "body" | "feet"> = ["head", "body", "feet"];

// แต้มล้น (§6.8 ในดอค) — เดินตามลำดับช่อง หัว→ตัว→เท้า สะสมผลรวมต่อแกนไปเรื่อยๆ ชิ้นไหนดันเกิน cap
// ก่อนจะแสดง "ล้น N" ตรงชิ้นนั้น ห้ามปัดตัวเลขทิ้งเงียบๆ ผลรวมสุดท้ายต่อแกนตรงกับ effectiveStat() เสมอ
export function computeGearContributions(
  pet: PetForStats,
  caps: RaidStatRecord,
  equippedGear: EquippedGearForStats[]
): GearContributionRow[] {
  const statKeys: Exclude<RaidStatKey, "foc">[] = ["hp", "atk", "def", "spd"];
  const running: Record<Exclude<RaidStatKey, "foc">, number> = {} as never;
  for (const stat of statKeys) {
    running[stat] = Math.min(pet[STAT_COLUMN[stat]] ?? 0, caps[stat]);
  }

  const bySlot = new Map(equippedGear.map((g) => [g.slot, g]));
  const rows: GearContributionRow[] = [];

  for (const slot of SLOT_ORDER) {
    const gear = bySlot.get(slot);
    if (!gear) continue;

    const contributions: Array<{ stat: Exclude<RaidStatKey, "foc">; addition: number }> = [
      { stat: gear.mainStat, addition: gear.mainValue },
    ];
    if (gear.subStat && gear.subValue) {
      contributions.push({ stat: gear.subStat, addition: gear.subValue });
    }

    for (const { stat, addition } of contributions) {
      const before = running[stat];
      const afterUnclamped = before + addition;
      const after = Math.min(afterUnclamped, caps[stat]);
      running[stat] = after;
      rows.push({ slot, qualityLabel: gear.qualityLabel, stat, addition, before, after, overflow: afterUnclamped - after });
    }
  }

  return rows;
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

export type RollDisplay = { displayNeed: number; displayRoll: number; isGuaranteedPass: boolean };

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
  return { displayNeed, displayRoll, isGuaranteedPass: displayNeed <= 0 };
}
