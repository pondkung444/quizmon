import type { BgmZone } from "@/lib/audio/appAudio";

// pathname -> "โซนเสียง" (ไม่ใช่ track เจาะจงอีกต่อไป). appAudio เป็นเจ้าของ logic เลือกเพลงในโซน
// general เอง. ใช้ร่วมกันระหว่าง SoundProvider (สั่ง enterZone ตามหน้า) กับ SoundSettings / ปุ่ม mute
//
//   challenge = /raid/*        — bgm_challenge_loop วนซ้ำ (เบากว่าปกติ 10%)
//   silent    = /boss-raid/*   — จอมือถือนักเรียน เงียบสนิท (จอทีวี /tv เป็นระบบเสียงแยก tvAudio.ts)
//   silent    = /guardian/*    — พื้นที่ผู้ปกครอง ไม่มีเสียงเกมเลย (SoundProvider ก็ไม่ init/unlock ที่นี่ด้วย)
//   general   = ที่เหลือทั้งหมด — playlist สุ่มต่อเนื่อง (รวม /pet /quiz /adventure /pvp/* ฯลฯ)
export function isGuardianPath(pathname: string | null): boolean {
  return !!pathname && (pathname === "/guardian" || pathname.startsWith("/guardian/"));
}

export function zoneForPath(pathname: string | null): BgmZone {
  if (!pathname) return "general";
  if (pathname.startsWith("/boss-raid") || isGuardianPath(pathname)) return "silent";
  if (pathname.startsWith("/raid")) return "challenge";
  return "general";
}
