"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import type { DungeonCardState } from "@/lib/dungeon";
import { useDungeonProgress, formatCountdown } from "@/hooks/useDungeonProgress";
import { useSfx } from "@/lib/audio/useSfx";

// ตำแหน่งแกน X ของมอนบนภาพฉาก — map ความคืบหน้า 0-100% ไปเป็น 8%-88% เพราะซุ้มประตูปลายทาง
// ในภาพอยู่ที่ ~86-97% เท่านั้น ไม่ใช่ริมขวาสุดเป๊ะ (ใช้ค่าเดียวกับจอ B ใน /adventure)
const TRAVEL_X_MIN = 8;
const TRAVEL_X_MAX = 88;

function travelXPercent(progressPercent: number): number {
  return TRAVEL_X_MIN + (progressPercent / 100) * (TRAVEL_X_MAX - TRAVEL_X_MIN);
}

// การ์ดผจญภัยหน้า /pet — 4 สถานะ อยู่บนสุดของส่วน "กิจกรรม" (ใต้ CTA หลักเสมอ) เต็มความกว้าง
// (2026-09) เป็นจุดเดียวของผจญภัยบนหน้านี้แล้ว — เดิมมีไทล์ผจญภัยแยกอีกอันที่บอกเวลาซ้ำกัน
export default function DungeonAdventureCard({ state }: { state: DungeonCardState }) {
  const sfx = useSfx();
  if (state.status === "invite") {
    return (
      <div className="w-full rounded-2xl border border-border bg-card p-4 text-center">
        <p className="text-sm font-bold text-gold-hi">🗺️ ผจญภัยรอวันที่ Qmon โตเต็มที่</p>
        <p className="mt-1 text-xs text-text3">
          เลี้ยง Qmon จนถึงร่างสุดท้ายแล้ว จะพาไปผจญภัยหาของรางวัลได้
        </p>
      </div>
    );
  }

  if (state.status === "ready") {
    // CTA รอง — การ์ดสีผจญภัย (--pet-tile-adv-*) เต็มความกว้าง ยังเบากว่า CTA หลัก (HomeNextAction)
    return (
      <Link
        href="/adventure"
        onClick={() => sfx("tap")}
        className="flex w-full items-center gap-3 rounded-2xl bg-(--pet-tile-adv-bg) px-4 py-3 text-left text-(--pet-tile-adv-text) shadow-md transition active:scale-95"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/60 text-2xl" aria-hidden>
          🗺️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">ส่ง Qmon ไปผจญภัย</span>
          <span className="block truncate text-xs opacity-90">มี Qmon พร้อมออกเดินทาง</span>
        </span>
        <ChevronRight size={20} aria-hidden />
      </Link>
    );
  }

  return <ActiveDungeonStrip state={state} />;
}

function ActiveDungeonStrip({
  state,
}: {
  state: Extract<DungeonCardState, { status: "traveling" | "claimable" }>;
}) {
  const { dungeon, run } = state;
  const { percent, remainingMs } = useDungeonProgress(run.startedAt, run.endsAt);
  const isClaimable = state.status === "claimable";
  const xPercent = travelXPercent(percent);

  return (
    <Link
      href="/adventure"
      className={`relative flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-md transition active:scale-[0.98] ${
        isClaimable ? "ring-2 ring-gold" : ""
      }`}
    >
      {/* สเกลลงจากจอ B (DungeonScene.tsx) ตามสัดส่วนเดิม: สไปรต์ 32% ของความสูงฉาก, เท้า 82% —
          เดิมฉากสูงแค่ 64px + สไปรต์กล่องคงที่ 40px ทำให้เนื้อรูปที่เห็นจริงเหลือแค่ ~10px มองไม่ออก
          ว่าเป็นตัวอะไร ความสูงฉากในการ์ดนี้ (112px) ปรับเล็กกว่าจอ B (150px) ได้เพราะเป็นแค่การ์ดย่อ
          แต่สัดส่วนสไปรต์/เท้าต้องคงเดิมเพื่อให้มองออกเหมือนกัน */}
      <div className="relative h-32 w-full overflow-hidden">
        <Image
          src={dungeon.backgroundPath}
          alt=""
          fill
          className="object-cover"
          style={{ objectPosition: "center 62%" }}
        />
        <div
          className="absolute h-1.5 w-8 rounded-full transition-[left] duration-1000 ease-linear"
          style={{
            left: `${xPercent}%`,
            top: "82%",
            transform: "translate(-50%, -3px)",
            background: "radial-gradient(closest-side, rgba(10,20,50,0.25), transparent)",
          }}
        />
        <div
          className="absolute transition-[left] duration-1000 ease-linear"
          style={{ left: `${xPercent}%`, top: "82%", height: "32%", transform: "translate(-50%, -100%)" }}
        >
          <Image
            src={run.petImagePath}
            alt=""
            width={80}
            height={80}
            className="h-full w-auto object-contain drop-shadow"
          />
        </div>
      </div>
      {isClaimable && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-red" aria-hidden />}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-text">🗺️ ผจญภัย</span>
          <span className={`block truncate text-xs ${isClaimable ? "font-bold text-gold-hi" : "text-text3"}`}>
            {isClaimable ? "ถึงแล้ว! แตะเพื่อรับของรางวัล" : `กำลังเดินทาง · ${dungeon.nameTh}`}
          </span>
        </span>
        {isClaimable ? (
          <ChevronRight size={20} className="shrink-0 text-gold-hi" aria-hidden />
        ) : (
          <span className="shrink-0 rounded-lg bg-track px-2 py-1 font-mono text-sm font-bold text-text">
            ⏱ {formatCountdown(remainingMs)}
          </span>
        )}
      </div>
    </Link>
  );
}
