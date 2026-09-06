"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Toggle from "@/components/Toggle";
import { appAudio } from "@/lib/audio/appAudio";

// map เดียวกับ SoundProvider — settings อยู่ใต้ /settings ซึ่งไม่มี BGM พื้น แต่เผื่ออนาคต
function bgmForPath(pathname: string | null): "home" | "challenge" | null {
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
  return null;
}

export default function SoundSettings() {
  const pathname = usePathname();
  const enabled = useSyncExternalStore(
    (cb) => appAudio.subscribe(cb),
    () => appAudio.isEnabled(),
    () => true // default ON (server + first paint) — client snapshot ตามมาทันทีหลัง mount
  );

  useEffect(() => {
    appAudio.init();
  }, []);

  function handleChange(next: boolean) {
    // ปุ่มนี้เป็น user gesture จริง — unlock AudioContext ไปเลยถ้ายังไม่เคย
    if (next && !appAudio.isUnlocked()) appAudio.unlock();
    appAudio.setEnabled(next);
    if (next) appAudio.setBgm(bgmForPath(pathname));
  }

  return (
    <section className="rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="mb-1 text-sm font-bold text-gold-hi">เสียง</h2>
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-text">เสียงในเกม</span>
        <Toggle checked={enabled} onChange={handleChange} label="เสียงในเกม" />
      </div>
      <p className="text-xs text-text3">เสียงตอบถูก/ผิด เอฟเฟกต์ และเพลงประกอบ</p>
    </section>
  );
}
