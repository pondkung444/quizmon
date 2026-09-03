"use client";

import { useState } from "react";
import {
  startDungeonBonus,
  submitDungeonBonusAnswer,
  applyDungeonBonus,
  type BonusQuestion,
} from "@/app/dungeon/actions";

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

type Phase = "idle" | "loading" | "answering" | "applying" | "done";

// กล่องคำถามโบนัสระหว่างผจญภัย (จอ B) — component ใหม่ทั้งหมด ไม่ import จากหน้าโจทย์ปกติ
// (QuizClient.tsx) เด็ดขาดตามกฎเหล็ก Phase 3/4: ไม่มี timer ไม่มี combo/streak ต่างจากหน้าโจทย์ปกติ
// โดยตั้งใจ — ตอบแล้วขึ้นข้อถัดไปอัตโนมัติ ไม่ต้องกดปุ่ม "ถัดไป" แยก
export default function BonusQuizBox({
  dungeonRunId,
  initialBonusQuizUsed,
  initialBonusMinutesSaved,
  onApplied,
}: {
  dungeonRunId: string;
  initialBonusQuizUsed: boolean;
  initialBonusMinutesSaved: number;
  onApplied: (result: { endsAt: string; bonusMinutesSaved: number }) => void;
}) {
  const [phase, setPhase] = useState<Phase>(initialBonusQuizUsed ? "done" : "idle");
  const [questions, setQuestions] = useState<BonusQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ correctCount: number; bonusMinutesSaved: number } | null>(
    initialBonusQuizUsed
      ? { correctCount: Math.round(initialBonusMinutesSaved / 12), bonusMinutesSaved: initialBonusMinutesSaved }
      : null
  );

  async function handleStart() {
    setPhase("loading");
    setErrorMessage(null);
    try {
      const { questions: loaded } = await startDungeonBonus(dungeonRunId);
      setQuestions(loaded);
      setIndex(0);
      setCorrectCount(0);
      setPhase("answering");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "เริ่มคำถามโบนัสไม่สำเร็จ");
      setPhase("idle");
    }
  }

  async function handleSelect(choiceIndex: number) {
    if (selectedChoice !== null) return;
    setSelectedChoice(choiceIndex);
    setErrorMessage(null);
    try {
      const question = questions[index];
      const { isCorrect } = await submitDungeonBonusAnswer({
        dungeonRunId,
        questionId: question.id,
        choiceIndex,
      });
      const nextCorrectCount = correctCount + (isCorrect ? 1 : 0);
      setCorrectCount(nextCorrectCount);

      if (index + 1 >= questions.length) {
        setPhase("applying");
        const result = await applyDungeonBonus(dungeonRunId);
        setSummary({ correctCount: result.correctCount, bonusMinutesSaved: result.bonusMinutesSaved });
        setPhase("done");
        onApplied({ endsAt: result.endsAt, bonusMinutesSaved: result.bonusMinutesSaved });
      } else {
        setIndex((i) => i + 1);
        setSelectedChoice(null);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ตอบคำถามไม่สำเร็จ");
      setSelectedChoice(null);
    }
  }

  if (phase === "done" && summary) {
    return (
      <div className="w-full max-w-xs rounded-2xl border border-gold-dim bg-card p-3 text-center">
        <p className="text-sm font-bold text-gold-hi">
          ตอบถูก {summary.correctCount} ข้อ ร่นทางไป {summary.bonusMinutesSaved} นาที
        </p>
      </div>
    );
  }

  if (phase === "idle" || phase === "loading") {
    return (
      <div className="w-full max-w-xs rounded-2xl border border-gold-dim bg-card p-4 text-center">
        <p className="text-sm font-bold text-gold-hi">ช่วยเร่งทางให้หน่อยไหม</p>
        <p className="mt-1 text-xs text-text3">ตอบคำถาม 5 ข้อ ตอบถูกแต่ละข้อร่นเวลาได้ 12 นาที</p>
        {errorMessage && <p className="mt-2 text-xs text-red">{errorMessage}</p>}
        <button
          type="button"
          disabled={phase === "loading"}
          onClick={handleStart}
          className="mt-3 w-full rounded-2xl border border-gold bg-amber py-2.5 text-sm font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {phase === "loading" ? "กำลังเตรียมคำถาม..." : "เริ่มตอบคำถาม"}
        </button>
      </div>
    );
  }

  const current = questions[index];

  return (
    <div className="w-full max-w-xs rounded-2xl border border-gold-dim bg-card p-4">
      <p className="mb-2 text-center text-xs text-text2">ข้อที่ {index + 1}/5</p>
      {current && (
        <>
          <p className="mb-3 text-center font-sarabun text-sm font-bold text-text">{current.questionText}</p>
          <div className="flex flex-col gap-2">
            {current.choices.map((choiceText, choiceIndex) => {
              const isSelected = selectedChoice === choiceIndex;
              return (
                <button
                  key={choiceIndex}
                  type="button"
                  disabled={selectedChoice !== null || phase === "applying"}
                  onClick={() => handleSelect(choiceIndex)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm text-text transition disabled:cursor-not-allowed ${
                    isSelected ? "border-amber bg-amber/10" : "border-border bg-track"
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card text-xs font-bold text-text2">
                    {THAI_LETTERS[choiceIndex] ?? choiceIndex + 1}
                  </span>
                  {choiceText}
                </button>
              );
            })}
          </div>
        </>
      )}
      {phase === "applying" && <p className="mt-3 text-center text-xs text-text3">กำลังสรุปผล...</p>}
      {errorMessage && <p className="mt-2 text-center text-xs text-red">{errorMessage}</p>}
    </div>
  );
}
