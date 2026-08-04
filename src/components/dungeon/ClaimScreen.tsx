"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { DungeonInfo, DungeonRunDetail } from "@/lib/dungeon";
import { claimDungeonRun, type ClaimDungeonRunResult } from "@/app/dungeon/actions";
import { FOOD_LABEL, FOOD_IMAGE_PATH } from "@/lib/labels";
import { getPetImagePath } from "@/lib/petImage";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import DungeonScene from "@/components/dungeon/DungeonScene";

type ModalStage = "none" | "food" | "egg";

// จอ C — รอเคลม สไปรต์นิ่งอยู่ที่ปลายทาง ไม่มีปุ่มยกเลิก/ออกก่อนเวลาเช่นเดียวกับจอ B
export default function ClaimScreen({ dungeon, run }: { dungeon: DungeonInfo; run: DungeonRunDetail }) {
  const router = useRouter();
  const [isClaiming, setIsClaiming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimDungeonRunResult | null>(null);
  const [modalStage, setModalStage] = useState<ModalStage>("none");

  async function handleClaim() {
    if (isClaiming) return;
    setIsClaiming(true);
    setErrorMessage(null);
    try {
      const claimResult = await claimDungeonRun(run.id);
      setResult(claimResult);
      setModalStage("food");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "รับของไม่สำเร็จ");
      setIsClaiming(false);
    }
  }

  // อาหารกับไข่เด้งแยกจังหวะกัน — ปิดโมดัลอาหารก่อนถึงเปิดโมดัลไข่ (ถ้าได้) ไม่ทับซ้อนกัน
  function handleCloseFoodModal() {
    if (result?.eggAwarded) {
      setModalStage("egg");
    } else {
      router.push("/pet");
    }
  }

  function handleCloseEggModal() {
    router.push("/pet");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title={dungeon.nameTh} />

      <div className="flex w-full flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-5">
        <DungeonScene
          backgroundPath={dungeon.backgroundPath}
          sprite={{ imagePath: run.petImagePath, xPercent: 88, animate: false }}
        />

        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

        <button
          type="button"
          disabled={isClaiming}
          onClick={handleClaim}
          className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {isClaiming ? "กำลังรับของ..." : "รับของ"}
        </button>
      </div>

      {modalStage === "food" && result && (
        <FoodRewardModal foodKind={result.foodKind} onClose={handleCloseFoodModal} />
      )}
      {modalStage === "egg" && result?.eggAwarded && result.eggNameTh && result.eggSpritePrefix && (
        <EggRewardModal
          eggNameTh={result.eggNameTh}
          imagePath={getPetImagePath(result.eggSpritePrefix, 1, null, null)}
          onClose={handleCloseEggModal}
        />
      )}
    </main>
  );
}

// ฉลองได้อาหาร — สไตล์เดียวกับระบบป้อนอาหาร (FOOD_LABEL/FOOD_IMAGE_PATH) โมดัลเต็มจอแบบเดียวกับ
// WeeklyRewardCelebration.tsx
function FoodRewardModal({ foodKind, onClose }: { foodKind: "A" | "B"; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
        <p className="text-sm text-text3">🎁 กลับมาจากผจญภัยพร้อมของกำนัล!</p>
        <h2 className="text-xl font-bold text-gold-hi">ได้รับ {FOOD_LABEL[foodKind]}</h2>
        <Image
          src={FOOD_IMAGE_PATH[foodKind]}
          alt={FOOD_LABEL[foodKind]}
          width={96}
          height={96}
          unoptimized
          className="animate-evolve-pop"
        />
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

// ฉลองได้ไข่ — ลีลาเดียวกับ WeeklyRewardCelebration.tsx (legendary/รางวัลพิเศษ)
function EggRewardModal({
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
        <p className="text-sm text-text3">✨ เจอไข่หายากระหว่างทาง!</p>
        <h2 className="text-xl font-bold text-gold-hi">ได้รับ {eggNameTh}</h2>
        <Image src={imagePath} alt={eggNameTh} width={160} height={160} className="animate-evolve-pop" />
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
        >
          เย้! ไปดูคลังไข่
        </button>
      </div>
    </div>
  );
}
