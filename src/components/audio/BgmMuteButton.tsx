"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Music, VolumeX } from "lucide-react";
import { appAudio } from "@/lib/audio/appAudio";
import { bgmForPath } from "@/lib/audio/bgmForPath";

// ปุ่มเปิด/ปิด "เพลงพื้นหลัง (BGM)" อย่างเดียว — ไม่แตะ master toggle / SFX
// วางบนหน้าควิซ + หน้าท้าทาย (ดู sound-system handoff). sync สดกับ Settings ผ่าน appAudio.subscribe()
export default function BgmMuteButton({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const masterOn = useSyncExternalStore(
    (cb) => appAudio.subscribe(cb),
    () => appAudio.isEnabled(),
    () => true
  );
  const bgmOn = useSyncExternalStore(
    (cb) => appAudio.subscribe(cb),
    () => appAudio.isBgmEnabled(),
    () => true
  );

  const active = masterOn && bgmOn;

  function toggle() {
    const next = !bgmOn;
    if (next && !appAudio.isUnlocked()) appAudio.unlock();
    appAudio.setBgmEnabled(next);
    if (next) appAudio.setBgm(bgmForPath(pathname));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={bgmOn}
      aria-label={bgmOn ? "ปิดเพลงพื้นหลัง" : "เปิดเพลงพื้นหลัง"}
      title={bgmOn ? "ปิดเพลงพื้นหลัง" : "เปิดเพลงพื้นหลัง"}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-gold-dim bg-card/90 backdrop-blur transition active:scale-95 ${
        active ? "text-amber" : "text-text3"
      } ${className}`}
    >
      {bgmOn ? <Music size={16} /> : <VolumeX size={16} />}
    </button>
  );
}
