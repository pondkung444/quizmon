"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";

// mount ครั้งเดียวใน root layout — คุมทั้ง session_start/session_end/screen_view
//
// ลำดับ effect สำคัญ: ต้อง addEventListener("visibilitychange", ...) ของตัวเอง "ก่อน" เรียก
// track() ครั้งแรกเสมอ เพราะ track() แรกจะไป lazy-register visibilitychange listener ของ
// src/lib/analytics.ts เอง (ตัวที่ยิง sendBeacon ตอนปิดแท็บ) — ถ้าสลับลำดับ ตอนปิดแท็บ beacon
// จะยิงไปก่อน session_end ถูกใส่ buffer ทำให้ event หลุด
export default function AnalyticsTracker({
  activePetStage,
  activePetSubline,
}: {
  activePetStage: number | null;
  activePetSubline: string | null;
}) {
  const pathname = usePathname();
  const lastScreenRef = useRef<string | null>(null);
  // ค่าเริ่มต้นเป็น placeholder เฉยๆ — ของจริงตั้งใน effect ด้านล่างเสมอ (ห้ามเรียก Date.now()
  // ตรงนี้ตอน render เพราะ render ต้อง pure)
  const sessionStartedAtRef = useRef<number>(0);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden") {
        const durationSec = Math.round((Date.now() - sessionStartedAtRef.current) / 1000);
        track("session_end", {
          last_screen: lastScreenRef.current,
          duration_sec: durationSec,
        });
      } else if (document.visibilityState === "visible") {
        sessionStartedAtRef.current = Date.now();
        track("session_start", {
          active_pet_stage: activePetStage,
          active_pet_subline: activePetSubline,
        });
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    sessionStartedAtRef.current = Date.now();
    track("session_start", {
      active_pet_stage: activePetStage,
      active_pet_subline: activePetSubline,
    });

    return () => document.removeEventListener("visibilitychange", handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastScreenRef.current !== null && lastScreenRef.current !== pathname) {
      track("screen_view", { from: lastScreenRef.current, to: pathname });
    }
    lastScreenRef.current = pathname;
  }, [pathname]);

  return null;
}
