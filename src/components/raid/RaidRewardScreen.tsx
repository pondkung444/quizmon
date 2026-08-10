"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { RaidGearItemView } from "@/lib/raid";
import { claimRaidReward } from "@/app/raid/actions";
import { getPetImagePath } from "@/lib/petImage";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import RaidScene from "@/components/raid/RaidScene";

const STAT_LABEL_TH: Record<string, string> = { hp: "HP", atk: "ATK", def: "DEF", spd: "SPD", foc: "FOC" };
const SLOT_LABEL_TH: Record<string, string> = { head: "หัว", body: "ตัว", feet: "เท้า" };

const OUTCOME_COPY: Record<"win" | "lose_stat" | "lose_quiz", { emoji: string; title: string; body: string }> = {
  win: { emoji: "🏆", title: "ชนะบอสแล้ว!", body: "สถิติและคำตอบผ่านเกณฑ์ด่านนี้ครบแล้ว" },
  // ห้ามมีข้อความแนว "อีกนิดเดียวจะชนะแล้ว" ตามดอค — แพ้สองแบบชี้ทางแก้คนละทางกันตรงๆ
  lose_stat: {
    emoji: "💪",
    title: "สถิติยังไม่ถึงเกณฑ์ด่านนี้",
    body: "ลองฝึกฝนหรือฟาร์มด่านง่ายเพิ่มให้สถิติของ Qmon สูงขึ้นก่อน แล้วค่อยกลับมาท้าทายใหม่นะ",
  },
  lose_quiz: {
    emoji: "📖",
    title: "ตอบคำถามยังไม่ผ่านเกณฑ์ด่านนี้",
    body: "ลองทบทวนเนื้อหาที่ยังไม่ถนัดเพิ่มก่อน แล้วค่อยกลับมาท้าทายใหม่นะ",
  },
};

// จอสรุป — ได้ของเสมอไม่ว่าชนะหรือแพ้ (กฎเหล็ก) claimRaidReward เป็น idempotent เรียกซ้ำได้ผลเดิม
// ปิดแอปก่อนกดรับของแล้วกลับมาเปิดใหม่ก็ต้องเจอของชิ้นเดิม ไม่สุ่มใหม่
export default function RaidRewardScreen({
  runId,
  outcome,
  backgroundPath,
  gearItem,
}: {
  runId: string;
  outcome: "win" | "lose_stat" | "lose_quiz";
  backgroundPath: string | null;
  gearItem: RaidGearItemView | null;
}) {
  const router = useRouter();
  const claimedRef = useRef(false);
  const [claimedGear, setClaimedGear] = useState<RaidGearItemView | null>(gearItem);
  const [isClaiming, setIsClaiming] = useState(gearItem === null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // ไข่ epic (ridge_storm เท่านั้น) — แยก popup จากของ gear เดิมเพราะเด้งไม่พร้อมกันเสมอ (การันตี
  // ครั้งแรกสุด/ผ่าน pity meter) ต้องเปิดเองหลัง claim สำเร็จ ปิดแล้วไม่ navigate ออก ให้เห็นการ์ด
  // gear ด้านล่างต่อ (ปุ่ม "กลับไปหา Qmon" เดิมเป็นทางออกจริงจุดเดียว)
  const [eggResult, setEggResult] = useState<{ nameTh: string; spritePrefix: string } | null>(null);
  const [showEggModal, setShowEggModal] = useState(false);

  // จบรอบแล้ว (claim_raid_reward เปลี่ยน raid_runs.status เป็น 'completed') — ตั้งใจไม่
  // router.refresh() หลัง claim สำเร็จ เพราะ getActiveRaidRun() กรองเฉพาะ status='in_progress'
  // เท่านั้น refresh แล้วจอนี้จะหายวับไปเป็นจอ predeparture ทันทีก่อนผู้เล่นได้เห็นของที่ได้เลย
  // (เจอบั๊กจริงตอนทดสอบ) ใช้ผลจาก claimRaidReward() อัปเดต state ในนี้ตรงๆ แทน
  useEffect(() => {
    if (claimedGear !== null || claimedRef.current) return;
    claimedRef.current = true;
    claimRaidReward(runId)
      .then((result) => {
        setClaimedGear(result);
        if (result.eggAwarded && result.eggNameTh && result.eggSpritePrefix) {
          setEggResult({ nameTh: result.eggNameTh, spritePrefix: result.eggSpritePrefix });
          setShowEggModal(true);
        }
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "รับของไม่สำเร็จ");
      })
      .finally(() => setIsClaiming(false));
  }, [claimedGear, runId]);

  const copy = OUTCOME_COPY[outcome];

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title="สรุปผล" />

      <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-5 text-center">
        <RaidScene backgroundPath={backgroundPath} />

        <div>
          <p className="text-6xl">{copy.emoji}</p>
          <h1 className="mt-2 text-2xl font-bold text-gold-hi">{copy.title}</h1>
          <p className="mt-1 text-sm text-text3">{copy.body}</p>
        </div>

        {errorMessage && <p className="text-sm text-red">{errorMessage}</p>}

        {isClaiming || !claimedGear ? (
          <p className="text-sm text-text3">กำลังจัดของ...</p>
        ) : (
          <div className="w-full max-w-xs rounded-3xl border-2 border-gold bg-track p-5">
            <p className="text-xs text-text2">อุปกรณ์ที่ได้</p>
            <p className="mt-1 text-lg font-bold text-gold-hi">
              {SLOT_LABEL_TH[claimedGear.slot] ?? claimedGear.slot} ·{" "}
              {claimedGear.qualityLabel ?? claimedGear.quality.toUpperCase()}
            </p>
            <div className="mt-3 flex flex-col gap-1 text-sm text-text">
              <p>
                {STAT_LABEL_TH[claimedGear.mainStat] ?? claimedGear.mainStat} +{claimedGear.mainValue}
              </p>
              {claimedGear.subStat && claimedGear.subValue !== null && (
                <p className="text-text2">
                  {STAT_LABEL_TH[claimedGear.subStat] ?? claimedGear.subStat} +{claimedGear.subValue}
                </p>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push("/pet")}
          className="w-full max-w-xs rounded-2xl border-2 border-border py-3 text-lg font-bold text-text2 transition active:scale-95"
        >
          กลับไปหา Qmon
        </button>
      </div>

      {showEggModal && eggResult && (
        <RaidEggRewardModal
          eggNameTh={eggResult.nameTh}
          imagePath={getPetImagePath(eggResult.spritePrefix, 1, null, null)}
          onClose={() => setShowEggModal(false)}
        />
      )}
    </main>
  );
}

// ฉลองได้ไข่ epic — ลีลาเดียวกับ EggRewardModal ใน dungeon/ClaimScreen.tsx แค่ปิดแล้วไม่ navigate
// ออก (แตกต่างจากของ adventure) เพราะจอนี้ยังมีการ์ด gear ให้ดูต่อ + ปุ่ม "กลับไปหา Qmon" ของตัวเอง
function RaidEggRewardModal({
  eggNameTh,
  imagePath,
  onClose,
}: {
  eggNameTh: string;
  imagePath: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
        <p className="text-sm text-text3">✨ ของรางวัลพิเศษจากการท้าทาย!</p>
        <h2 className="text-xl font-bold text-gold-hi">ได้รับ {eggNameTh}</h2>
        <Image src={imagePath} alt={eggNameTh} width={160} height={160} className="animate-evolve-pop" />
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
        >
          เย้!
        </button>
      </div>
    </div>
  );
}
