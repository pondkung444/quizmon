"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import CollectPetButton from "@/components/CollectPetButton";
import type { EggChoice } from "@/components/EggChoiceModal";
import StatRadar from "@/components/StatRadar";
import SpeechBubble from "@/components/SpeechBubble";
import { usePersonalityMessage } from "@/hooks/usePersonalityMessage";
import type { PersonalityKey } from "@/lib/personality";
import { getEvolutionProgress } from "@/lib/evolution";
import EvolutionGlow from "@/components/EvolutionGlow";
import WeeklyJourneyCard from "@/components/WeeklyJourneyCard";
import type { JourneyDay } from "@/lib/weeklyJourney";

const EVOLVE_ANIMATION_MS = 650;

export default function PetCard({
  stage,
  stageName,
  stageDescription,
  exp,
  nextThreshold,
  progress,
  nickname,
  speciesName,
  petImagePath,
  statHp,
  statAtk,
  statDef,
  statSpd,
  statFoc,
  mathCorrect,
  scienceCorrect,
  comboMilestones,
  expToday,
  dailyCap,
  justEvolved,
  eggChoices,
  personalityKey,
  journeyDays,
}: {
  stage: number;
  stageName: string;
  stageDescription: string;
  exp: number;
  nextThreshold: number | undefined;
  progress: number;
  nickname: string | null;
  speciesName: string | null;
  petImagePath: string | null;
  statHp: number | null;
  statAtk: number | null;
  statDef: number | null;
  statSpd: number | null;
  statFoc: number | null;
  mathCorrect: number;
  scienceCorrect: number;
  comboMilestones: number;
  expToday: number;
  dailyCap: number;
  justEvolved: boolean;
  eggChoices: EggChoice[];
  personalityKey: PersonalityKey;
  journeyDays: JourneyDay[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [tapPulse, setTapPulse] = useState(0);
  const { message: personalityMessage, triggerEvent: triggerPersonalityEvent } =
    usePersonalityMessage(personalityKey);

  useEffect(() => {
    if (!justEvolved) return;
    const timer = setTimeout(() => router.replace("/pet"), EVOLVE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [justEvolved, router]);

  const isMaxStage = stage === 4;
  const cappedToday = expToday >= dailyCap;
  const dailyProgress = Math.min(1, dailyCap > 0 ? expToday / dailyCap : 1);

  const hasFullStats =
    statHp != null && statAtk != null && statDef != null && statSpd != null && statFoc != null;

  const idleAnimClass = stage === 1 ? "animate-egg-wobble" : "animate-pet-bob";
  const evolutionProgress = getEvolutionProgress(stage, exp);

  return (
    <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
      {/* 1. weekly journey (แทนที่ stage indicator วงกลม 4 จุดเดิม) — กดเข้าปฏิทินเต็มเดือนได้ */}
      <WeeklyJourneyCard days={journeyDays} onClick={() => router.push("/pet/calendar")} />
      <p className="text-xs text-text3">
        ระยะ {stage} · {stageName} — {stageDescription}
      </p>

      {/* 2. nameplate */}
      <div className="relative flex h-14 w-14 items-center justify-center rotate-45 border-2 border-gold bg-track">
        <span className="-rotate-45 px-1 text-[10px] font-bold leading-tight text-gold-hi">
          {nickname ?? speciesName ?? stageName}
        </span>
      </div>

      {/* 3. avatar (click to expand) */}
      <button
        type="button"
        onClick={() => {
          setExpanded((v) => !v);
          setTapPulse((n) => n + 1);
          triggerPersonalityEvent("tapQmon");
        }}
        className="relative flex h-[220px] w-[220px] items-center justify-center"
        aria-expanded={expanded}
      >
        {personalityMessage && (
          <div className="absolute -top-2 z-10 -translate-y-full">
            <SpeechBubble message={personalityMessage} />
          </div>
        )}
        <span className="absolute h-[200px] w-[200px] rounded-full bg-amber opacity-20 blur-2xl" />
        <svg viewBox="0 0 200 200" className="absolute h-[190px] w-[190px] animate-spin-slow opacity-40">
          <circle cx="100" cy="100" r="90" fill="none" stroke="var(--color-gold)" strokeWidth={1} strokeDasharray="4 10" />
          <circle cx="100" cy="100" r="72" fill="none" stroke="var(--color-gold)" strokeWidth={1} strokeDasharray="1 8" />
        </svg>
        <div className={`relative flex items-center justify-center ${!justEvolved ? idleAnimClass : ""}`}>
          <div key={tapPulse} className={tapPulse > 0 ? "animate-pet-tap" : ""}>
            {petImagePath ? (
              <EvolutionGlow progress={evolutionProgress} dailyCapped={cappedToday}>
                <Image
                  src={petImagePath}
                  alt="ภาพ Qmon"
                  width={180}
                  height={180}
                  priority
                  className={`relative ${justEvolved ? "animate-evolve-pop" : ""}`}
                />
              </EvolutionGlow>
            ) : (
              <div
                className={`relative flex h-[180px] w-[180px] items-center justify-center rounded-xl bg-track text-sm text-text3 ${
                  justEvolved ? "animate-evolve-pop" : ""
                }`}
              >
                ไม่พบรูป Qmon
              </div>
            )}
          </div>
        </div>
      </button>

      {/* 4. exp -> next stage */}
      {nextThreshold !== undefined ? (
        <div className="w-full max-w-xs">
          <p className="mb-1 text-left text-xs text-text2">พลังวิวัฒนาการ → ร่างถัดไป</p>
          <div className="h-3 w-full overflow-hidden rounded-full bg-track">
            <div className="h-full bg-amber transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-text3">
            อีก {Math.max(0, nextThreshold - exp)} แต้ม จะโตเป็นระยะถัดไป
          </p>
        </div>
      ) : (
        <p className="text-sm font-medium text-gold-hi">โตเต็มที่แล้ว! เก่งมาก 🎉</p>
      )}

      {/* 5. daily training bar */}
      <div className="w-full max-w-xs">
        <p className="mb-1 text-left text-xs text-text2">พลังวันนี้</p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-track">
          <div className="h-full bg-amber transition-all" style={{ width: `${dailyProgress * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-text3">
          {Math.min(expToday, dailyCap)} / {dailyCap} แต้ม
        </p>
        {cappedToday && (
          <p className="mt-2 rounded-xl border border-amber-dim bg-amber/10 p-2 text-xs text-amber">
            น้องอิ่มความรู้แล้ววันนี้ พรุ่งนี้มาฝึกต่อนะ
          </p>
        )}
      </div>

      {/* 6. CTA */}
      {isMaxStage ? (
        <CollectPetButton eggChoices={eggChoices} />
      ) : cappedToday ? (
        <div className="flex w-full max-w-xs flex-col items-center gap-1">
          <Link
            href="/quiz"
            className="w-full rounded-2xl border-2 border-gold py-3 text-lg font-bold text-gold-hi transition active:scale-95"
          >
            ฝึกต่อได้
          </Link>
          <p className="text-xs text-text3">ฝึกเพิ่มได้ แต่วันนี้ไม่ดันระยะแล้ว</p>
        </div>
      ) : (
        <Link
          href="/quiz"
          className="w-full max-w-xs rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
        >
          ฝึก Qmon
        </Link>
      )}

      {/* 6.5 quiz stat cards — always visible, no click needed */}
      <div className="grid w-full max-w-xs grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-1 rounded-xl bg-track py-3">
          <span className="text-xl">🔥</span>
          <span className="text-lg font-bold text-gold-hi">{mathCorrect}</span>
          <span className="text-[10px] text-text3">คณิตถูก</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-track py-3">
          <span className="text-xl">💧</span>
          <span className="text-lg font-bold text-gold-hi">{scienceCorrect}</span>
          <span className="text-[10px] text-text3">วิทย์ถูก</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-xl bg-track py-3">
          <span className="text-xl">⚡</span>
          <span className="text-lg font-bold text-gold-hi">{comboMilestones}</span>
          <span className="text-[10px] text-text3">คอมโบ</span>
        </div>
      </div>
      {/* 7. expandable detail */}
      {expanded && isMaxStage && hasFullStats && (
        <div className="flex w-full flex-col items-center gap-4 border-t border-border pt-5">
          <div>
            <h2 className="text-sm font-bold text-gold-hi">พลังประจำตัว</h2>
            <p className="text-xs text-text3">จะได้ใช้เมื่อระบบผจญภัย &amp; ต่อสู้เปิดในอนาคต</p>
          </div>
          <StatRadar
            stats={{
              hp: statHp as number,
              atk: statAtk as number,
              def: statDef as number,
              spd: statSpd as number,
              foc: statFoc as number,
            }}
          />
        </div>
      )}
    </div>
  );
}
