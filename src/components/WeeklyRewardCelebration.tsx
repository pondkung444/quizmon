"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { claimWeeklyLeaderboardReward } from "@/app/pet/actions";
import { getPetImagePath } from "@/lib/petImage";

type Reveal = { eggNameTh: string; imagePath: string };

// เช็ค+เคลมรางวัลไข่ทิพย์อัตโนมัติทุกครั้งที่โหลด /pet — ไม่แสดงอะไรเลยถ้าไม่ได้รางวัล (เงียบ)
// โชว์ป๊อปอัพฉลองเต็มจอเฉพาะตอน awarded:true เท่านั้น (ดู claimWeeklyLeaderboardReward ใน
// app/pet/actions.ts — idempotent เรียกซ้ำได้ปลอดภัย)
export default function WeeklyRewardCelebration() {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // กัน useEffect ยิง server action ซ้ำ — เจอจริงบน production /pet ว่า POST /pet ยิง 2 ครั้งต่อการ
  // เปิดหน้าหนึ่งครั้ง (effect ถูก invoke ซ้ำ) claimWeeklyLeaderboardReward() idempotent อยู่แล้ว
  // แต่ไม่ควรเปลือง round-trip + RPC ทุกครั้ง (pattern เดียวกับ missionStartedRef ใน QuizClient.tsx)
  const claimedRef = useRef(false);

  useEffect(() => {
    if (claimedRef.current) return;
    claimedRef.current = true;
    claimWeeklyLeaderboardReward()
      .then((result) => {
        if (!result.awarded) return;
        setReveal({
          eggNameTh: result.eggNameTh,
          imagePath: getPetImagePath(result.spritePrefix, 1, null, null),
        });
      })
      .catch((err) => {
        // เช็ครางวัลพังไม่ควรทำทั้งหน้า /pet ล่ม (เหมือนการ์ดภารกิจ/leaderboard อื่นๆ ในหน้านี้)
        console.error("claimWeeklyLeaderboardReward failed:", err);
      });
  }, []);

  if (!reveal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
        <p className="text-sm text-text3">🏆 อันดับ 1 กระดานผู้นำประจำสัปดาห์ที่แล้ว!</p>
        <h2 className="text-xl font-bold text-gold-hi">ได้รับ {reveal.eggNameTh}</h2>
        <Image
          src={reveal.imagePath}
          alt={reveal.eggNameTh}
          width={160}
          height={160}
          className="animate-evolve-pop"
        />
        <button
          type="button"
          onClick={() => setReveal(null)}
          className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
        >
          เย้! ไปดูคลังไข่
        </button>
      </div>
    </div>
  );
}
