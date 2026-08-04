"use client";

import { useState } from "react";
import Image from "next/image";
import type { DungeonInfo, DungeonRunDetail } from "@/lib/dungeon";
import { DUNGEON_PITY_GOAL } from "@/lib/dungeon";
import { useDungeonProgress, formatCountdown } from "@/hooks/useDungeonProgress";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import DungeonScene from "@/components/dungeon/DungeonScene";
import BonusQuizBox from "@/components/dungeon/BonusQuizBox";

// map ความคืบหน้า 0-100% ไปเป็น 8%-88% ของความกว้างภาพ เพราะซุ้มประตูปลายทางในภาพอยู่ที่ ~86-97%
// เท่านั้น ไม่ใช่ริมขวาสุดเป๊ะ (ค่าเดียวกับ DungeonAdventureCard.tsx บนหน้า /pet)
const TRAVEL_X_MIN = 8;
const TRAVEL_X_MAX = 88;

function travelXPercent(progressPercent: number): number {
  return TRAVEL_X_MIN + (progressPercent / 100) * (TRAVEL_X_MAX - TRAVEL_X_MIN);
}

// จอ B — ระหว่างเดินทาง ไม่มีปุ่มยกเลิก/ออกจากดันเจี้ยนก่อนเวลาที่ไหนเลยในจอนี้ (ตัดออกโดยตั้งใจ)
// ปรับ (Phase 4.5): เดิมนาฬิกานับถอยหลังใหญ่ที่สุดในหน้า = ตอกย้ำว่า "ต้องรออีกนาน" — สลับให้
// progress bar เป็นตัวหลัก นาฬิกาเป็นตัวรอง + เพิ่มแถบ "รออะไรอยู่" ให้เห็นรางวัลตลอดเวลาที่รอ
export default function InProgressScreen({
  dungeon,
  initialRun,
  pityMeter,
}: {
  dungeon: DungeonInfo;
  initialRun: DungeonRunDetail;
  pityMeter: number;
}) {
  // ends_at อัปเดตทันทีหลังใช้คำถามโบนัส (BonusQuizBox.onApplied) — lift ขึ้นมาที่นี่แทนอ่านจาก
  // prop เดิมตรงๆ เพื่อให้ตำแหน่งมอน/นับถอยหลังขยับตามทันทีไม่ต้องรอ reload
  const [run, setRun] = useState(initialRun);
  const { percent, remainingMs } = useDungeonProgress(run.startedAt, run.endsAt);
  const xPercent = travelXPercent(percent);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title={dungeon.nameTh} />

      <div className="flex w-full flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-5">
        <DungeonScene
          backgroundPath={dungeon.backgroundPath}
          sprite={{ imagePath: run.petImagePath, xPercent, animate: true }}
        />

        {/* progress bar — ตัวหลักสื่อความคืบหน้า นาฬิกาเป็นตัวรอง */}
        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-track">
            <div className="h-full bg-indigo transition-all" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-text2">เดินมาแล้ว {Math.round(percent)}%</span>
            <span className="font-mono text-[15px] text-text2">{formatCountdown(remainingMs)}</span>
          </div>
        </div>

        {/* รออะไรอยู่ — ให้เห็นของรางวัลตลอดเวลาที่รอ ไม่ใช่เห็นแค่ตอนกดส่ง (จอ A) */}
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-track px-3 py-2">
            <span className="text-lg">🍽️</span>
            <span className="text-xs text-text2">อาหาร 1</span>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-gold-dim bg-track px-3 py-2">
            <Image src="/pets/egg4_stage1_egg.png" alt="" width={20} height={20} />
            <span className="text-xs text-text2">ไข่ 5%</span>
          </div>
        </div>

        <BonusQuizBox
          dungeonRunId={run.id}
          initialBonusQuizUsed={run.bonusQuizUsed}
          initialBonusMinutesSaved={run.bonusMinutesSaved}
          onApplied={(result) => {
            setRun((prev) => ({
              ...prev,
              endsAt: result.endsAt,
              bonusQuizUsed: true,
              bonusMinutesSaved: result.bonusMinutesSaved,
            }));
          }}
        />

        <section className="rounded-xl border border-gold-dim bg-track p-3">
          <p className="text-xs text-text2">มิเตอร์การันตีไข่</p>
          <div className="mt-1 flex items-center justify-between">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-track">
              <div
                className="h-full bg-indigo transition-all"
                style={{ width: `${Math.min(100, (pityMeter / DUNGEON_PITY_GOAL) * 100)}%` }}
              />
            </div>
            <span className="ml-3 font-mono text-sm font-bold text-text">
              {pityMeter} / {DUNGEON_PITY_GOAL}
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
