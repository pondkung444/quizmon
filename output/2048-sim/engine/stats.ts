export type ForestStats = Record<"hp" | "atk" | "def" | "spd" | "foc", number>;

export type PetStats = {
  stage: number;
  stat_hp: number | null;
  stat_atk: number | null;
  stat_def: number | null;
  stat_spd: number | null;
  stat_foc: number | null;
};

export const STAT_KEYS = ["hp", "atk", "def", "spd", "foc"] as const;

// Only the pet's stored snapshot enters this mode. Never add equipped gear,
// recalculate growth counters, or apply lane/personality multipliers again.
export function readForestStats(pet: PetStats, caps: ForestStats): ForestStats {
  if (![1, 2, 3, 4].includes(pet.stage)) throw new Error("ระยะของ Qmon ไม่ถูกต้อง");
  if (pet.stage < 4) return { hp: 50, atk: 50, def: 50, spd: 50, foc: 50 };
  const result = {} as ForestStats;
  for (const key of STAT_KEYS) {
    const raw = pet[`stat_${key}`];
    if (raw === null || !Number.isFinite(raw) || raw < 0 ||
        !Number.isFinite(caps[key]) || caps[key] <= 0) {
      throw new Error("สเตตัสของ Qmon ยังไม่ครบ กรุณาเลือกตัวอื่น");
    }
    result[key] = Math.min(raw, caps[key]);
  }
  return result;
}

export function forestConfig(stats: ForestStats) {
  for (const key of STAT_KEYS) {
    if (!Number.isFinite(stats[key]) || stats[key] < 0) throw new Error("สเตตัสไม่ถูกต้อง");
  }
  return {
    hp: Math.round(80 + 0.4 * stats.hp),
    attack: 4 + 0.02 * stats.atk,
    armor: 6 + 0.04 * stats.def,
    heal: 8,
    bonus: 0.15,
    cooldown: Math.max(1, Math.ceil(6 / (1 + stats.spd / 200))),
    critChance: Math.min(1, stats.foc / 1000),
    critMultiplier: 1.5,
  };
}
