"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { DungeonInfo, DungeonRunDetail } from "@/lib/dungeon";
import { DUNGEON_PITY_GOAL } from "@/lib/dungeon";
import { claimDungeonRun, type ClaimDungeonRunResult } from "@/app/dungeon/actions";
import { FOOD_LABEL, FOOD_IMAGE_PATH } from "@/lib/labels";
import { getPetImagePath } from "@/lib/petImage";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import DungeonScene from "@/components/dungeon/DungeonScene";

type ModalStage = "none" | "food" | "egg" | "meter";

const CLAIM_TIMEOUT_MS = 15000;
const EGG_MODAL_DELAY_MS = 600;

// จอ C — รอเคลม สไปรต์นิ่งอยู่ที่ปลายทาง ไม่มีปุ่มยกเลิก/ออกก่อนเวลาเช่นเดียวกับจอ B
export default function ClaimScreen({
  dungeon,
  run,
  pityMeter,
}: {
  dungeon: DungeonInfo;
  run: DungeonRunDetail;
  pityMeter: number;
}) {
  const router = useRouter();
  const [isClaiming, setIsClaiming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimDungeonRunResult | null>(null);
  const [modalStage, setModalStage] = useState<ModalStage>("none");
  // กันเคส timeout ปลดล็อกปุ่มแล้วผู้เล่นกดซ้ำ จน request เก่าที่ยังค้างอยู่กลับมาเปิด modal ทับของใหม่
  const claimAttemptRef = useRef(0);

  async function handleClaim() {
    if (isClaiming) return;
    const attemptId = ++claimAttemptRef.current;
    setIsClaiming(true);
    setErrorMessage(null);

    const timeoutId = setTimeout(() => {
      if (claimAttemptRef.current !== attemptId) return;
      setIsClaiming(false);
      setErrorMessage("รับของช้ากว่าปกติ ลองใหม่อีกครั้งนะ");
    }, CLAIM_TIMEOUT_MS);

    try {
      const claimResult = await claimDungeonRun(run.id);
      clearTimeout(timeoutId);
      if (claimAttemptRef.current !== attemptId) return;
      setResult(claimResult);
      setModalStage("food");
    } catch (err) {
      clearTimeout(timeoutId);
      if (claimAttemptRef.current !== attemptId) return;
      setErrorMessage(err instanceof Error ? err.message : "รับของไม่สำเร็จ ลองใหม่อีกครั้งนะ");
    } finally {
      if (claimAttemptRef.current === attemptId) setIsClaiming(false);
    }
  }

  // อาหารกับไข่เด้งแยกจังหวะกัน — ปิดโมดัลอาหารก่อน หน่วง ~600ms แล้วค่อยเปิดโมดัลไข่ (ถ้าได้)
  // ถ้าไม่ได้ไข่รอบนี้ ไม่พูดเชิงลบเด็ดขาด — โชว์มิเตอร์ที่ขยับแทนเสมอ
  function handleCloseFoodModal() {
    if (result?.eggAwarded) {
      setModalStage("none");
      setTimeout(() => setModalStage("egg"), EGG_MODAL_DELAY_MS);
    } else {
      setModalStage("meter");
    }
  }

  function handleCloseEggModal() {
    router.push("/pet");
  }

  function handleCloseMeterModal() {
    router.push("/pet");
  }

  const durationHours = dungeon.durationMinutes / 60;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-4 px-4 pb-24 pt-6">
      <AdventureHeader title={dungeon.nameTh} subtitle={`ผจญภัยครบ ${durationHours} ชั่วโมงแล้ว`} />

      <div className="flex w-full flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-5">
        <DungeonScene
          backgroundPath={dungeon.backgroundPath}
          sprite={{ imagePath: run.petImagePath, xPercent: 88, animate: false }}
        />

        <p className="text-center text-base font-bold text-text">{run.petSpeciesName} กลับมาแล้ว</p>

        <section>
          <p className="mb-2 text-xs text-text2">ขีดสะสมไข่หายาก</p>
          <div className="flex items-center justify-between gap-3">
            <PityPips filled={pityMeter} total={DUNGEON_PITY_GOAL} />
            <span className="shrink-0 font-mono text-sm font-bold text-text">
              {pityMeter} / {DUNGEON_PITY_GOAL}
            </span>
          </div>
        </section>

        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

        <button
          type="button"
          disabled={isClaiming}
          onClick={handleClaim}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-gold bg-amber px-6 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {isClaiming && <Spinner />}
          {isClaiming ? "กำลังรับ..." : "รับของ"}
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
      {modalStage === "meter" && result && (
        <MeterProgressModal pityMeter={result.pityMeter} onClose={handleCloseMeterModal} />
      )}
    </main>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-track" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function PityPips({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex flex-1 flex-wrap gap-1.5" role="img" aria-label={`สะสม ${filled} จาก ${total} ขีด`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            i < filled ? "bg-gold" : "border border-gold-dim bg-transparent"
          }`}
        />
      ))}
    </div>
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

// รอบที่ไม่ได้ไข่ — ห้ามพูดเชิงลบ ("ไม่ได้ไข่"/"โชคไม่ดี") แสดงมิเตอร์ที่เพิ่งขยับแทนเสมอ ขีดล่าสุด
// เรืองแสงให้เห็นว่าใกล้ขึ้นอีกก้าว
function MeterProgressModal({ pityMeter, onClose }: { pityMeter: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
        <p className="text-sm text-text3">🧭 เข้าใกล้ไข่หายากอีกขีด</p>
        <h2 className="text-xl font-bold text-gold-hi">
          ขีดสะสม {pityMeter} / {DUNGEON_PITY_GOAL}
        </h2>
        <div className="flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: DUNGEON_PITY_GOAL }).map((_, i) => {
            const isLatest = i === pityMeter - 1;
            return (
              <span
                key={i}
                className={`h-3 w-3 shrink-0 rounded-full ${
                  i < pityMeter ? "bg-gold" : "border border-gold-dim bg-transparent"
                } ${isLatest ? "animate-pip-glow" : ""}`}
              />
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
        >
          เยี่ยม!
        </button>
      </div>
    </div>
  );
}
