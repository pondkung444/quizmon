"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { appAudio, type AppBgmState } from "@/lib/audio/appAudio";

const INTRO_SEEN_KEY = "qm_sound_intro_seen";
const INTRO_TEXT = "🔊 เปิดเสียงแล้ว ปิดได้ที่ตั้งค่า";
const INTRO_AUTO_DISMISS_MS = 6000;

// map pathname -> BGM ที่ต้องการ (ดู sound-system-phase-2 handoff §C.3)
function bgmForPath(pathname: string | null): AppBgmState {
  if (!pathname) return null;
  if (
    pathname.startsWith("/pet") ||
    pathname.startsWith("/collection") ||
    pathname.startsWith("/social") ||
    pathname.startsWith("/hall-of-fame")
  ) {
    return "home";
  }
  // เฉพาะระบบท้าทาย (raid) — ไม่ชนกับ /boss-raid เพราะ startsWith("/raid") เป็น false
  if (pathname.startsWith("/raid")) return "challenge";
  return null;
}

const noopSubscribe = () => () => {};
function readIntroPending(): boolean {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}

// mount ที่เดียวใน layout — คุม AudioContext unlock, BGM ตามหน้า, และ toast แนะนำครั้งเดียว
export default function SoundProvider() {
  const pathname = usePathname();
  const introPending = useSyncExternalStore(noopSubscribe, readIntroPending, () => false);
  const [dismissed, setDismissed] = useState(false);

  const dismissIntro = useCallback(() => {
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* private mode — toast จะโผล่รอบหน้าอีกที ยอมได้ */
    }
    setDismissed(true);
  }, []);

  // init + gesture-unlock ครั้งเดียวทั้งแอป
  useEffect(() => {
    appAudio.init();

    const unlock = () => {
      appAudio.unlock();
      // เริ่ม BGM ตามหน้าปัจจุบัน (appAudio no-op เองถ้าเสียงถูกปิด)
      appAudio.setBgm(bgmForPath(window.location.pathname));
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // เปลี่ยนหน้า -> อัปเดต BGM (fade/cut จัดการใน appAudio)
  useEffect(() => {
    appAudio.setBgm(bgmForPath(pathname));
  }, [pathname]);

  // auto-dismiss toast
  useEffect(() => {
    if (!introPending || dismissed) return;
    const t = setTimeout(dismissIntro, INTRO_AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [introPending, dismissed, dismissIntro]);

  if (!introPending || dismissed) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex justify-center px-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <button
        type="button"
        onClick={dismissIntro}
        className="pointer-events-auto max-w-sm rounded-full border border-gold-dim bg-card/95 px-4 py-2 text-sm font-medium text-text shadow-lg backdrop-blur active:scale-95"
      >
        {INTRO_TEXT}
      </button>
    </div>
  );
}
