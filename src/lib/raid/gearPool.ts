import type { RaidStatKey } from "@/lib/raid/stats";

// ตัดสินใจ 8 ส.ค. 2026 (ดู raid-gear-equip-unequip-handoff §1) — ประเภท × แกนหลักที่สุ่มได้
// หัว = ATK + HP · ตัว = DEF + SPD · เท้า = SPD + ATK (SPD ออกได้ 2 ช่องเพราะเป็นแกนคุ้มสุด)
// บังคับใช้จริงใน claim_raid_reward RPC (SQL) — ที่นี่เป็นแหล่งความจริงฝั่ง TS สำหรับ UI/validation
// เท่านั้น ไม่ได้ถูกเรียกจาก drop logic ตรงๆ เพราะ drop ทำใน SQL ทั้งหมด
export const RAID_GEAR_MAIN_STAT_POOL: Record<"head" | "body" | "feet", Exclude<RaidStatKey, "foc">[]> = {
  head: ["atk", "hp"],
  body: ["def", "spd"],
  feet: ["spd", "atk"],
};
