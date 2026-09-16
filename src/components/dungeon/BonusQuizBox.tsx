"use client";

import { useState } from "react";
import {
  startDungeonBonus,
  submitDungeonBonusAnswer,
  applyDungeonBonus,
  type BonusQuestion,
  type SubmitDungeonBonusAnswerResult,
} from "@/app/dungeon/actions";
import { useSfx } from "@/lib/audio/useSfx";

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
  const sfx = useSfx();
  const [phase, setPhase] = useState<Phase>(initialBonusQuizUsed ? "done" : "idle");
  const [questions, setQuestions] = useState<BonusQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<SubmitDungeonBonusAnswerResult | null>(null);
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
      setFeedback(null);
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
      const result = await submitDungeonBonusAnswer({
        dungeonRunId,
        questionId: question.id,
        choiceIndex,
      });
      sfx(result.correct ? "answer_correct" : "answer_wrong");
      const nextCorrectCount = correctCount + (result.correct ? 1 : 0);
      setCorrectCount(nextCorrectCount);
      setFeedback(result);

      if (index + 1 >= questions.length) {
        return;
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ตอบคำถามไม่สำเร็จ");
      setSelectedChoice(null);
    }
  }

  async function handleContinue() {
    if (!feedback || phase !== "answering") return;
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setSelectedChoice(null);
      setFeedback(null);
      return;
    }

    setPhase("applying");
    setErrorMessage(null);
    try {
      const result = await applyDungeonBonus(dungeonRunId);
      setSummary({ correctCount: result.correctCount, bonusMinutesSaved: result.bonusMinutesSaved });
      setPhase("done");
      onApplied({ endsAt: result.endsAt, bonusMinutesSaved: result.bonusMinutesSaved });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "สรุปคำถามไม่สำเร็จ");
      setPhase("answering");
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
      <div className="mb-3 flex items-center justify-between gap-3 text-xs text-text2">
        <span>คำถามเร่งการเดินทาง</span>
        <span>ข้อที่ {index + 1}/{questions.length}</span>
      </div>
      {current && (
        <>
          <p className="mb-3 font-sarabun text-base font-bold leading-relaxed text-text">{current.questionText}</p>
          <div className="flex flex-col gap-2">
            {current.choices.map((choiceText, choiceIndex) => {
              const isSelected = (feedback?.selectedIndex ?? selectedChoice) === choiceIndex;
              const isCorrect = feedback?.correctIndex === choiceIndex;
              const isWrongSelected = Boolean(feedback && isSelected && !isCorrect);
              const style = isCorrect
                ? "border-emerald-400 bg-emerald-400/10"
                : isWrongSelected
                  ? "border-red bg-red/10"
                  : isSelected
                    ? "border-amber bg-amber/10"
                    : "border-border bg-track";
              return (
                <button
                  key={choiceIndex}
                  type="button"
                  disabled={selectedChoice !== null || phase === "applying"}
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(choiceIndex)}
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm text-text transition disabled:cursor-not-allowed disabled:opacity-100 ${style}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card text-xs font-bold text-text2">
                    {THAI_LETTERS[choiceIndex] ?? choiceIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{choiceText}</span>
                  {isCorrect && <strong className="shrink-0 text-[10px] text-emerald-200">คำตอบที่ถูก</strong>}
                  {isWrongSelected && <strong className="shrink-0 text-[10px] text-red">คำตอบของเรา</strong>}
                </button>
              );
            })}
          </div>
          {feedback && <div className="mt-3 flex flex-col gap-2" role="status">
            <p className={`rounded-xl border p-3 text-sm font-bold ${feedback.correct ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-border bg-track text-text"}`}>
              {feedback.correct ? "ถูกต้อง! ร่นเวลาเดินทางได้ 12 นาที" : "รอบนี้ยังไม่ถูก ไม่เป็นไร ไปต่อกัน"}
            </p>
            {!feedback.correct && <p className="rounded-xl border border-red/50 bg-red/10 p-3 text-sm text-text"><strong>คำตอบของเรา:</strong> {current.choices[feedback.selectedIndex]}</p>}
            <p className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-sm text-text"><strong>คำตอบที่ถูก:</strong> {current.choices[feedback.correctIndex]}</p>
            <div className="rounded-xl bg-track p-3 text-sm leading-relaxed text-text2">
              <strong className="block text-xs text-gold-hi">เหตุผล</strong>
              <p className="mt-1">{feedback.explanation || "จำคำตอบนี้ไว้ แล้วใช้หลักเดียวกันกับข้อถัดไป"}</p>
            </div>
            <button type="button" disabled={phase === "applying"} onClick={handleContinue} className="min-h-12 w-full rounded-2xl border border-gold bg-amber px-4 font-bold text-track shadow-lg active:scale-95 disabled:opacity-60">
              {phase === "applying" ? "กำลังสรุปผล..." : index + 1 >= questions.length ? "ดูผลการเร่งเวลา" : "ข้อต่อไป →"}
            </button>
          </div>}
        </>
      )}
      {phase === "applying" && <p className="mt-3 text-center text-xs text-text3">กำลังสรุปผล...</p>}
      {errorMessage && <p className="mt-2 text-center text-xs text-red">{errorMessage}</p>}
    </div>
  );
}
