// ระบบ "ประลอง" (PvP) — เลขดวลฝั่ง client (แสดงผลเท่านั้น — ความจริงอยู่ใน SQL submit_pvp_card)
//
// ⚠️ TEMP: เลขทั้งหมดในไฟล์นี้ยังไม่จูน รอข้อมูลจริงหลายแมตช์แบบเดียวกับ raid FOC/SPD
//    ต้องตรงกับสูตรใน supabase/migrations/20260903170100_pvp_slice_1_rpcs.sql (submit_pvp_card)

import { pvpEffectiveStat, type PvpPetStats } from "@/lib/pvp/stats";

export const PVP_BASE_TIMER_SECONDS = 60;
export const PVP_HASTE_TIMER_SECONDS = 30; // การ์ด effect_id='haste' — ต้องตรงกับ assign_pvp_card (SQL)
export const PVP_MAX_ROUNDS = 30;

// timer ของ "ผู้ตอบ" — สไลซ์ 2: server บังคับผ่าน pvp_matches.round_deadline
// (client ยังคำนวณเลขนี้ไว้ fallback ตอนยังไม่มี deadline ใน view)
// TEMP
export function pvpTimerSeconds(defenderStats: PvpPetStats): number {
  return PVP_BASE_TIMER_SECONDS + Math.round(pvpEffectiveStat(defenderStats, "spd") / 20);
}

// timer ที่คิดเอฟเฟกต์การ์ดปัจจุบันแล้ว — haste = 30 วิ ตายตัว
export function pvpTimerSecondsForCard(
  defenderStats: PvpPetStats,
  effectId: string | null
): number {
  if (effectId === "haste") return PVP_HASTE_TIMER_SECONDS;
  return pvpTimerSeconds(defenderStats);
}

// ดาเมจโดยประมาณเมื่อ "ผู้ตอบ" ตอบผิด (โชว์บนการ์ดก่อนส่ง / สรุปหลังตอบ) — TEMP
export function pvpEstimatedDamage(attackerStats: PvpPetStats, defenderStats: PvpPetStats): number {
  const base = Math.round((10 * pvpEffectiveStat(attackerStats, "atk")) / 100);
  return Math.max(1, Math.round(base * (1 - pvpEffectiveStat(defenderStats, "def") / 200)));
}

export function pvpCritChancePct(attackerStats: PvpPetStats): number {
  return pvpEffectiveStat(attackerStats, "foc"); // % ตรงๆ ไม่หาร 2 (ต่างจาก raid)
}
