"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Toggle from "@/components/Toggle";
import { appAudio } from "@/lib/audio/appAudio";
import { bgmForPath } from "@/lib/audio/bgmForPath";

export default function SoundSettings() {
  const pathname = usePathname();
  const enabled = useSyncExternalStore(
    (cb) => appAudio.subscribe(cb),
    () => appAudio.isEnabled(),
    () => true // default ON (server + first paint) — client snapshot ตามมาทันทีหลัง mount
  );
  const bgmEnabled = useSyncExternalStore(
    (cb) => appAudio.subscribe(cb),
    () => appAudio.isBgmEnabled(),
    () => true
  );
  const bgmVolume = useSyncExternalStore(
    (cb) => appAudio.subscribe(cb),
    () => appAudio.getBgmVolume(),
    () => 0.2
  );

  useEffect(() => {
    appAudio.init();
  }, []);

  function handleMasterChange(next: boolean) {
    // ปุ่มนี้เป็น user gesture จริง — unlock AudioContext ไปเลยถ้ายังไม่เคย
    if (next && !appAudio.isUnlocked()) appAudio.unlock();
    appAudio.setEnabled(next);
    if (next) appAudio.setBgm(bgmForPath(pathname));
  }

  function handleBgmChange(next: boolean) {
    if (next && !appAudio.isUnlocked()) appAudio.unlock();
    appAudio.setBgmEnabled(next);
    if (next) appAudio.setBgm(bgmForPath(pathname));
  }

  return (
    <section className="rounded-2xl border border-gold-dim bg-card p-4">
      <h2 className="mb-1 text-sm font-bold text-gold-hi">เสียง</h2>

      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-text">เสียงในเกมทั้งหมด</span>
        <Toggle checked={enabled} onChange={handleMasterChange} label="เสียงในเกมทั้งหมด" />
      </div>
      <p className="text-xs text-text3">สวิตช์หลัก — ปิดแล้วเงียบทั้งเอฟเฟกต์และเพลงพื้นหลัง</p>

      <div className="my-2 border-t border-border" />

      <div className={enabled ? "" : "opacity-40"}>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-text">เพลงพื้นหลัง (BGM)</span>
          <Toggle
            checked={bgmEnabled}
            onChange={handleBgmChange}
            disabled={!enabled}
            label="เพลงพื้นหลัง"
          />
        </div>

        <div className="flex items-center gap-3 py-2">
          <span className="w-16 shrink-0 text-xs text-text3">ระดับเสียง</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(bgmVolume * 100)}
            disabled={!enabled || !bgmEnabled}
            onChange={(e) => appAudio.setBgmVolume(Number(e.target.value) / 100)}
            aria-label="ระดับเสียงเพลงพื้นหลัง"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-track accent-amber disabled:cursor-not-allowed"
          />
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-text3">
            {Math.round(bgmVolume * 100)}%
          </span>
        </div>
      </div>
    </section>
  );
}
