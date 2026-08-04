"use client";

import Link from "next/link";
import Image from "next/image";
import type { DungeonCardState } from "@/lib/dungeon";
import { useDungeonProgress, formatCountdown } from "@/hooks/useDungeonProgress";

// ตำแหน่งแกน X ของมอนบนภาพฉาก — map ความคืบหน้า 0-100% ไปเป็น 8%-88% เพราะซุ้มประตูปลายทาง
// ในภาพอยู่ที่ ~86-97% เท่านั้น ไม่ใช่ริมขวาสุดเป๊ะ (ใช้ค่าเดียวกับจอ B ใน /adventure)
const TRAVEL_X_MIN = 8;
const TRAVEL_X_MAX = 88;

function travelXPercent(progressPercent: number): number {
  return TRAVEL_X_MIN + (progressPercent / 100) * (TRAVEL_X_MAX - TRAVEL_X_MIN);
}

// การ์ดผจญภัยหน้า /pet — 4 สถานะ วางไว้ใต้บล็อก CTA หลัก (มิชชัน/ปุ่มฝึก Qmon) เสมอ ไม่อยู่เหนือ
export default function DungeonAdventureCard({ state }: { state: DungeonCardState }) {
  if (state.status === "invite") {
    return (
      <div className="w-full max-w-xs rounded-2xl border border-gold-dim bg-card p-4 text-center">
        <p className="text-sm font-bold text-gold-hi">ผจญภัยรอวันที่ Qmon โตเต็มที่</p>
        <p className="mt-1 text-xs text-text3">
          เลี้ยง Qmon จนถึงร่างสุดท้ายแล้ว จะพาไปผจญภัยหาของรางวัลได้
        </p>
      </div>
    );
  }

  if (state.status === "ready") {
    // CTA รอง — น้ำหนักเบากว่าปุ่ม "เริ่มภารกิจ"/"ฝึก Qmon" (fill สี amber) แต่ยังต้องดูเป็นปุ่มกดได้
    // ชัดเจน ไม่ใช่ text link — ใช้ pattern เดียวกับปุ่ม "ฝึกต่อได้" ใน PetCard.tsx (outline gold
    // เต็มความกว้าง มุมโค้งเท่ากัน) แทน pattern แถวข้อความเดิม
    return (
      <Link
        href="/adventure"
        className="flex w-full max-w-xs flex-col items-center gap-0.5 rounded-2xl border-2 border-gold py-3 text-center transition active:scale-95"
      >
        <span className="text-lg font-bold text-gold-hi">ส่งไปผจญภัย</span>
        <span className="text-xs text-text3">มี Qmon พร้อมออกเดินทาง</span>
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
      className="flex w-full max-w-xs flex-col overflow-hidden rounded-2xl border border-gold-dim bg-card transition active:scale-95"
    >
      {/* สเกลลงจากจอ B (DungeonScene.tsx) ตามสัดส่วนเดิม: สไปรต์ 32% ของความสูงฉาก, เท้า 82% —
          เดิมฉากสูงแค่ 64px + สไปรต์กล่องคงที่ 40px ทำให้เนื้อรูปที่เห็นจริงเหลือแค่ ~10px มองไม่ออก
          ว่าเป็นตัวอะไร ความสูงฉากในการ์ดนี้ (112px) ปรับเล็กกว่าจอ B (150px) ได้เพราะเป็นแค่การ์ดย่อ
          แต่สัดส่วนสไปรต์/เท้าต้องคงเดิมเพื่อให้มองออกเหมือนกัน */}
      <div className="relative h-28 w-full overflow-hidden">
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
      <div className="flex items-center justify-between px-4 py-2">
        {isClaimable ? (
          <span className="text-sm font-bold text-gold-hi">ถึงแล้ว! รับของได้เลย →</span>
        ) : (
          <>
            <span className="text-xs text-text3">กำลังเดินทาง</span>
            <span className="font-mono text-sm font-bold text-text">{formatCountdown(remainingMs)}</span>
          </>
        )}
      </div>
    </Link>
  );
}
