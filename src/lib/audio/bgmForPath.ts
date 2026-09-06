import type { AppBgmState } from "@/lib/audio/appAudio";

// pathname -> BGM ที่ต้องการ. ใช้ร่วมกันระหว่าง SoundProvider (ตั้ง BGM ตามหน้า) กับ
// SoundSettings / ปุ่ม mute (รู้ว่าหน้านี้ควรเล่น BGM อะไรตอนเปิดสวิตช์กลับ)
//
// /boss-raid มีระบบเสียงแยก (tvAudio.ts) — ไม่แตะที่นี่ (startsWith("/raid") เป็น false อยู่แล้ว)
export function bgmForPath(pathname: string | null): AppBgmState {
  if (!pathname) return null;
  if (
    pathname.startsWith("/pet") ||
    pathname.startsWith("/collection") ||
    pathname.startsWith("/social") ||
    pathname.startsWith("/hall-of-fame")
  ) {
    return "home";
  }
  if (pathname.startsWith("/raid")) return "challenge";
  if (pathname.startsWith("/quiz")) return "quiz";
  return null;
}
