// ชื่อระดับความหายากของไข่ (egg_types.tier) — ใช้ร่วมกันทุกหน้าที่โชว์ระดับไข่ ห้ามนิยามซ้ำที่อื่น
// (เดิม epic ขึ้นเป็น "epic" ในคลังไข่ / "เอปิก" ในหน้าเลือกไข่ / "สุดยอด" ในสมุดสะสม — ปอนด์เลือก
// "สุดยอด" 2026-09 ให้ตรงกับสมุดสะสม) ลำดับ: ธรรมดา → หายาก → สุดยอด → ในตำนาน
export const EGG_TIER_LABEL_TH: Record<string, string> = {
  common: "ธรรมดา",
  rare: "หายาก",
  epic: "สุดยอด",
  legendary: "ในตำนาน",
};

// สูง → ต่ำ (ใช้เรียงคลังไข่ให้ฟองพิเศษขึ้นก่อน) tier ที่ไม่รู้จักต่อท้าย
export const EGG_TIER_ORDER = ["legendary", "epic", "rare", "common"];

export function eggTierLabel(tier: string): string {
  return EGG_TIER_LABEL_TH[tier] ?? tier;
}

export function eggTierRank(tier: string): number {
  const i = EGG_TIER_ORDER.indexOf(tier);
  return i === -1 ? EGG_TIER_ORDER.length : i;
}
