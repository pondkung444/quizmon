"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RaidPathOption } from "@/lib/raid";
import { chooseRaidPath, type ChooseRaidPathResult } from "@/app/raid/actions";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import RaidScene from "@/components/raid/RaidScene";

const STAT_LABEL_TH: Record<string, string> = { hp: "พลังชีวิต (HP)", atk: "พลังโจมตี (ATK)", def: "พลังป้องกัน (DEF)", spd: "ความเร็ว (SPD)", foc: "โฟกัส (FOC)" };
const COLOR_LABEL_TH: Record<string, string> = { green: "ง่าย", yellow: "ปานกลาง", red: "ยาก" };
const COLOR_DOT: Record<string, string> = { green: "bg-green-500", yellow: "bg-yellow-400", red: "bg-red-500" };

const ROLL_SPIN_MS = 1100;
const ROLL_SPIN_INTERVAL_MS = 70;
const REDUCED_MOTION_DELAY_MS = 300;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// จอทางแยก — ห้ามโชว์ stat ก่อนเลือกเด็ดขาด (ตัวเลือกมีแค่ชื่อเรื่องเล่า + สีความยาก)
//
// จอทอยเต๋า (feedback pass 2026-08-07): ผลจริงมาจาก server ทันทีที่ chooseRaidPath() resolve
// (result state, ล็อกแล้วถาวรฝั่ง DB) แต่ "เผย" ให้ผู้เล่นเห็นเป็น 2 จังหวะแยกกัน — เลือกทางแล้วเห็น
// แค่เงื่อนไข (ชื่ออุปสรรค + วัดจาก stat ไหน + "ต้องทอยเกิน N") ยังไม่เห็นผ่าน/ไม่ผ่าน ต้องกดปุ่ม
// "ทอย" เองก่อนถึงจะหมุนเลข ~1.1 วิ (คอสเมติกล้วนๆ ไม่สุ่มอะไรเองฝั่ง client) แล้วหยุดที่ค่าจริง —
// ตัวเลขที่โชว์ทั้งหมด (displayNeed/displayRoll) ผ่านการกลับด้าน+การ์ดมาจาก computeRollDisplay
// จุดเดียวใน src/lib/raid/stats.ts แล้ว (เรียกจาก actions.ts) ห้ามคำนวณ/กลับด้านซ้ำที่นี่
//
// resume: หน้านี้ resolve ไม่ได้จาก getActiveRaidRun() เลย — ทางแยกที่ผ่านแล้ว server จะขยับ
// current_step_index/phase ไปข้างหน้าทันทีตั้งแต่ตอน chooseRaidPath() (ดู choose_raid_path RPC)
// ทางแยกที่ตกจะเปลี่ยน phase เป็น 'quiz' ทันที — เพราะงั้น phase 'choosing' จาก server ไม่มีทาง
// เป็นสถานะที่ทอยไปแล้วรอเผยผล จึงไม่ต้องมี field ผลทอยใน RaidView phase นี้ (ต่างจาก phase 'quiz'
// ที่ต้องมี เพราะ resume กลางคันมาเจอ phase quiz ได้จริง)
export default function RaidPathScreen({
  runId,
  gaugeEarned,
  gaugeMax,
  stepIndex,
  obstacleCount,
  backgroundPath,
  petImagePath,
  options,
}: {
  runId: string;
  gaugeEarned: number;
  gaugeMax: number;
  stepIndex: number;
  obstacleCount: number;
  backgroundPath: string | null;
  petImagePath: string | null;
  options: RaidPathOption[];
}) {
  const router = useRouter();
  const [isChoosing, setIsChoosing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ChooseRaidPathResult | null>(null);
  const [rollPhase, setRollPhase] = useState<"revealed" | "rolling" | "settled">("revealed");
  const [rollDisplay, setRollDisplay] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  async function handleChoose(side: "a" | "b") {
    if (isChoosing || result) return;
    setIsChoosing(true);
    setErrorMessage(null);
    try {
      const res = await chooseRaidPath(runId, side);
      setResult(res);
      setRollPhase("revealed");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "เลือกทางไม่สำเร็จ");
    } finally {
      setIsChoosing(false);
    }
  }

  function handleRoll() {
    if (!result || rollPhase !== "revealed") return;
    setRollPhase("rolling");
    if (prefersReducedMotion()) {
      rollTimeoutRef.current = setTimeout(() => {
        setRollDisplay(result.displayRoll);
        setRollPhase("settled");
      }, REDUCED_MOTION_DELAY_MS);
      return;
    }
    rollIntervalRef.current = setInterval(() => {
      setRollDisplay(Math.floor(Math.random() * 101));
    }, ROLL_SPIN_INTERVAL_MS);
    rollTimeoutRef.current = setTimeout(() => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      setRollDisplay(result.displayRoll);
      setRollPhase("settled");
    }, ROLL_SPIN_MS);
  }

  function handleContinue() {
    setIsAdvancing(true);
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title="ทางแยก" subtitle={`ด่านที่ ${stepIndex + 1} จาก ${obstacleCount}`} />

      <div className="flex w-full flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-5">
        <RaidScene
          backgroundPath={backgroundPath}
          sprites={
            petImagePath
              ? [{ imagePath: petImagePath, leftPercent: 50, heightPercent: 32, animationClass: "animate-dungeon-walk-bob" }]
              : []
          }
        />

        <div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-indigo transition-all"
              style={{ width: `${gaugeMax > 0 ? (gaugeEarned / gaugeMax) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-text2">เกจสะสม {gaugeEarned} / {gaugeMax}</p>
        </div>

        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

        {!result ? (
          <div className="flex flex-col gap-3">
            {options.map((option) => (
              <button
                key={option.side}
                type="button"
                disabled={isChoosing}
                onClick={() => handleChoose(option.side)}
                className="flex items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-5 text-left shadow-sm transition hover:border-gold-dim active:scale-95 disabled:opacity-50"
              >
                <span className={`h-3 w-3 shrink-0 rounded-full ${COLOR_DOT[option.color]}`} />
                <span className="flex-1">
                  <span className="block text-lg font-bold text-text">{option.obstacleNameTh}</span>
                  <span className="block text-xs text-text3">ความยาก: {COLOR_LABEL_TH[option.color]}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border border-indigo-dim bg-track p-4 text-center">
              <p className="text-sm font-bold text-indigo-hi">{result.revealTh}</p>
              <p className="mt-1 text-xs text-text2">วัดจาก {STAT_LABEL_TH[result.stat] ?? result.stat}</p>
            </div>

            {/* กล่องทอยเต๋า — ตัวเลขต้องเป็นจุดเด่นสุดของจอ "ต้องทอยเกิน N" ต้องอยู่ตลอดทั้ง 3 จังหวะ
                (revealed/rolling/settled) ไม่หายไประหว่างหมุน โทนน้ำเงินน้ำแข็งล้วน ไม่ใช้โทนทอง */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-indigo-dim bg-indigo/10 p-6">
              <p className="text-sm font-bold text-indigo-hi">ต้องทอยเกิน {result.displayNeed}</p>

              <span
                className={`font-mono text-7xl font-black tabular-nums ${
                  rollPhase === "rolling"
                    ? "text-indigo-hi animate-raid-roll-spin"
                    : rollPhase === "settled"
                      ? result.rollPassed
                        ? "text-green-400 animate-raid-roll-pass"
                        : "text-red animate-raid-roll-fail"
                      : "text-text3"
                }`}
              >
                {rollPhase === "revealed" ? "?" : rollDisplay}
              </span>

              {rollPhase === "revealed" && (
                <button
                  type="button"
                  onClick={handleRoll}
                  className="rounded-2xl border border-indigo bg-indigo/20 px-8 py-3 text-lg font-bold text-indigo-hi shadow-lg transition active:scale-95"
                >
                  ทอย
                </button>
              )}
            </div>

            {rollPhase === "settled" && (
              <>
                {result.rollPassed ? (
                  <div className="rounded-2xl border border-gold-dim bg-amber/10 p-4 text-center">
                    <p className="text-base font-bold text-gold-hi">{result.resultText}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-red bg-red/10 p-4 text-center">
                    <p className="text-base font-bold text-red">ทอยไม่ผ่าน — ตอบคำถามแก้ตัวได้อีกครั้ง</p>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isAdvancing}
                  onClick={handleContinue}
                  className="rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {isAdvancing ? "กำลังไปต่อ..." : "ต่อไป"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
