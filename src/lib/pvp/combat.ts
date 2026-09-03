// ระบบ "ประลอง" (PvP) — เลขดวลฝั่ง client (แสดงผลเท่านั้น — ความจริงอยู่ใน SQL submit_pvp_card)
//
// ⚠️ TEMP: เลขทั้งหมดในไฟล์นี้ยังไม่จูน รอข้อมูลจริงหลายแมตช์แบบเดียวกับ raid FOC/SPD
//    ต้องตรงกับสูตรใน supabase/migrations/20260903170100_pvp_slice_1_rpcs.sql (submit_pvp_card)

import { pvpEffectiveStat, type PvpPetStats } from "@/lib/pvp/stats";

export const PVP_BASE_TIMER_SECONDS = 60;
export const PVP_MAX_ROUNDS = 30;

// timer ของ "ผู้ตอบ" — display เท่านั้นในสไลซ์ 1 (server ไม่บังคับ 60 วิ เพราะต้อง resume ได้)
// TEMP
export function pvpTimerSeconds(defenderStats: PvpPetStats): number {
  return PVP_BASE_TIMER_SECONDS + Math.round(pvpEffectiveStat(defenderStats, "spd") / 20);
}

// ดาเมจโดยประมาณเมื่อ "ผู้ตอบ" ตอบผิด (โชว์บนการ์ดก่อนส่ง / สรุปหลังตอบ) — TEMP
export function pvpEstimatedDamage(attackerStats: PvpPetStats, defenderStats: PvpPetStats): number {
  const base = Math.round((10 * pvpEffectiveStat(attackerStats, "atk")) / 100);
  return Math.max(1, Math.round(base * (1 - pvpEffectiveStat(defenderStats, "def") / 200)));
}

export function pvpCritChancePct(attackerStats: PvpPetStats): number {
  return pvpEffectiveStat(attackerStats, "foc"); // % ตรงๆ ไม่หาร 2 (ต่างจาก raid)
}
