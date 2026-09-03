"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RaidStatKey } from "@/lib/raid/stats";
import { submitRaidObstacleAnswer, type SubmitRaidObstacleAnswerResult } from "@/app/raid/actions";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import RaidScene from "@/components/raid/RaidScene";

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

// จอคำถามแก้ตัว — component ใหม่ทั้งหมด ไม่ import จากหน้าโจทย์ปกติ (QuizClient.tsx) ตามกฎเหล็ก
// ไม่มี timer/combo — ข้อเดิมเสมอเพราะ RPC ฝั่ง choose_raid_path ดึงคำถามไว้แล้วครั้งเดียว resume
// กลับมาจอนี้ก็เจอข้อเดิม (server ส่ง question เดิมมาจาก raid_run_steps.quiz_question_id)
export default function RaidObstacleQuizScreen({
  runId,
  gaugeEarned,
  gaugeMax,
  stepIndex,
  obstacleCount,
  backgroundPath,
  petImagePath,
  revealedTh,
  displayNeed,
  displayRoll,
  isGuaranteedPass,
  question,
}: {
  runId: string;
  gaugeEarned: number;
  gaugeMax: number;
  stepIndex: number;
  obstacleCount: number;
  backgroundPath: string | null;
  petImagePath: string | null;
  revealedStat: RaidStatKey;
  revealedTh: string;
  displayNeed: number;
  displayRoll: number;
  isGuaranteedPass: boolean;
  question: { id: number; questionText: string; choices: string[] };
}) {
  const router = useRouter();
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [result, setResult] = useState<SubmitRaidObstacleAnswerResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSelect(choiceIndex: number) {
    if (selectedChoice !== null || isSubmitting) return;
    setSelectedChoice(choiceIndex);
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await submitRaidObstacleAnswer(runId, choiceIndex);
      setResult(res);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ตอบคำถามไม่สำเร็จ");
      setSelectedChoice(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleContinue() {
    setIsAdvancing(true);
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title="ตอบคำถามแก้ตัว" subtitle={`ด่านที่ ${stepIndex + 1} จาก ${obstacleCount}`} />

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
          <p className="mt-1 text-xs text-text2">เกจสะสม {gaugeEarned} / {gaugeMax} (ไม่เปลี่ยนไม่ว่าตอบถูกหรือผิด)</p>
        </div>

        {/* ผลทอยที่ล็อกไว้แล้ว — โชว์ตัวเลขทันทีแบบนิ่งๆ ไม่มีปุ่ม ไม่ animate (ทั้งตอนมาจากจอทางแยก
            สดๆ ซึ่งกดทอยไปแล้วบนจอนั้น และตอน resume ซึ่งผลลัพธ์ล็อกไปตั้งแต่ตอนทอยจริงแล้ว — นี่คือ
            จุดที่พลาดง่ายสุด ห้าม auto-replay การหมุนซ้ำที่นี่) เกณฑ์เดียวกับจอทางแยก "ต้องทอยเกิน N" */}
        <div
          className={`flex flex-col items-center gap-1 rounded-2xl border p-3 ${
            isGuaranteedPass ? "border-gold bg-gold/10" : "border-red bg-red/10"
          }`}
        >
          <p className="text-xs text-text2">
            {isGuaranteedPass ? "สเตตัสสูงพอ ผ่านแน่นอน!" : `ต้องทอยเกิน ${displayNeed}`} · ทอยได้ {displayRoll}
          </p>
        </div>

        <div className="rounded-2xl border border-gold-dim bg-track p-3 text-center">
          <p className="text-sm font-bold text-gold-hi">{revealedTh}</p>
        </div>

        <h2 className="font-sarabun text-xl font-bold leading-relaxed text-text">{question.questionText}</h2>

        <div className="flex flex-col gap-3">
          {question.choices.map((choiceText, choiceIndex) => {
            const isSelected = selectedChoice === choiceIndex;
            let style = "border-border bg-card hover:border-gold-dim";
            if (result && isSelected) {
              style = result.isCorrect ? "border-gold bg-amber/10" : "border-red bg-red/10";
            } else if (isSelected) {
              style = "border-amber bg-amber/10";
            }
            return (
              <button
                key={choiceIndex}
                type="button"
                disabled={selectedChoice !== null || isSubmitting}
                onClick={() => handleSelect(choiceIndex)}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left font-sarabun text-lg font-medium text-text shadow-sm transition disabled:cursor-not-allowed ${style}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-track text-sm font-bold text-text2">
                  {THAI_LETTERS[choiceIndex] ?? choiceIndex + 1}
                </span>
                {choiceText}
              </button>
            );
          })}
        </div>

        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

        {result && (
          <>
            <div
              className={`rounded-2xl border p-4 text-center ${
                result.isCorrect ? "border-gold-dim bg-amber/10 text-gold-hi" : "border-red bg-red/10 text-red"
              }`}
            >
              <p className="text-lg font-bold">{result.isCorrect ? "ถูกต้อง! 🎉" : "ยังไม่ถูกนะ ไม่เป็นไร!"}</p>
              <p className="mt-1 text-sm">{result.resultText}</p>
            </div>

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
    </main>
  );
}
