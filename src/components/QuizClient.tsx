"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PublicQuestion, Subject } from "@/types/quiz";
import {
  startQuizRound,
  submitAnswer,
  finishQuizRound,
  type AnswerResult,
  type RoundFinishResult,
} from "@/app/quiz/actions";

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

const SUBJECTS: { id: Subject; label: string; emoji: string }[] = [
  { id: "math", label: "คณิตศาสตร์", emoji: "🧮" },
  { id: "science", label: "วิทยาศาสตร์", emoji: "🔬" },
];

type Phase = "select" | "loading" | "playing" | "summary";

type AnsweredRecord = { isCorrect: boolean; expEarned: number };

export default function QuizClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("select");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [combo, setCombo] = useState(0);
  const [answers, setAnswers] = useState<AnsweredRecord[]>([]);
  const [summary, setSummary] = useState<RoundFinishResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resetRoundState() {
    setIndex(0);
    setSelectedChoice(null);
    setResult(null);
    setCombo(0);
    setAnswers([]);
    setSummary(null);
    setErrorMessage(null);
  }

  function handleSelectSubject(nextSubject: Subject) {
    resetRoundState();
    setSubject(nextSubject);
    setPhase("loading");
    startTransition(async () => {
      try {
        const round = await startQuizRound(nextSubject);
        if (round.length === 0) {
          setErrorMessage("ยังไม่มีคำถามในหมวดนี้ ลองอีกวิชานะ");
          setPhase("select");
          return;
        }
        setQuestions(round);
        setPhase("playing");
      } catch {
        setErrorMessage("โหลดคำถามไม่สำเร็จ ลองใหม่อีกครั้งนะ");
        setPhase("select");
      }
    });
  }

  function handleSelectChoice(choiceIndex: number) {
    if (result || isPending) return;
    setSelectedChoice(choiceIndex);
    const current = questions[index];
    startTransition(async () => {
      const res = await submitAnswer({
        questionId: current.id,
        choiceIndex,
        comboBefore: combo,
      });
      setResult(res);
      setCombo(res.newCombo);
      setAnswers((prev) => [...prev, { isCorrect: res.correct, expEarned: res.expEarned }]);
    });
  }

  function handleNext() {
    const isLastQuestion = index + 1 >= questions.length;

    if (!isLastQuestion) {
      setIndex((i) => i + 1);
      setSelectedChoice(null);
      setResult(null);
      return;
    }

    const roundExpEarned = answers.reduce((sum, a) => sum + a.expEarned, 0);
    startTransition(async () => {
      const finishResult = await finishQuizRound(roundExpEarned);
      setSummary(finishResult);
      setPhase("summary");
    });
  }

  function handlePlayAgain() {
    if (subject) handleSelectSubject(subject);
  }

  function handleBackToSubjects() {
    router.push(summary?.evolved ? "/pet?evolved=1" : "/pet");
  }

  if (phase === "select" || phase === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gold-hi">เลือกวิชาที่จะฝึกวันนี้</h1>
          <p className="mt-1 text-sm text-text3">ตอบให้ถูกเยอะๆ แล้วไปเลี้ยงเพื่อนตัวน้อยกัน!</p>
        </div>

        {errorMessage && (
          <p className="rounded-xl border border-amber-dim bg-amber/10 p-3 text-center text-sm text-amber">
            {errorMessage}
          </p>
        )}

        <div className="flex flex-col gap-4">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={phase === "loading"}
              onClick={() => handleSelectSubject(s.id)}
              className="flex items-center justify-center gap-3 rounded-3xl border border-gold-dim bg-card px-6 py-10 text-2xl font-bold text-gold-hi shadow-lg transition hover:border-gold active:scale-95 disabled:opacity-60"
            >
              <span className="text-4xl">{s.emoji}</span>
              {phase === "loading" && subject === s.id ? "กำลังสุ่มคำถาม..." : s.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === "playing") {
    const current = questions[index];
    const progress = ((index + 1) / questions.length) * 100;
    const isLastQuestion = index + 1 >= questions.length;

    return (
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center justify-between text-sm font-medium text-text3">
            <span>ข้อที่ {index + 1}/{questions.length}</span>
            <span>{current.category}</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-amber transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <h2 className="text-xl font-bold leading-relaxed text-text">{current.question_text}</h2>

        <div className="flex flex-col gap-3">
          {current.choices.map((choiceText, choiceIndex) => {
            const isSelected = selectedChoice === choiceIndex;
            const isCorrectChoice = result && choiceIndex === result.correctIndex;
            const isWrongSelected = result && isSelected && !result.correct;

            let style = "border-border bg-card hover:border-gold-dim";
            if (isCorrectChoice) {
              style = "border-gold bg-amber/10";
            } else if (isWrongSelected) {
              style = "border-red bg-red/10";
            } else if (isSelected) {
              style = "border-amber bg-amber/10";
            }

            return (
              <button
                key={choiceIndex}
                type="button"
                data-testid="choice-button"
                disabled={!!result || isPending}
                onClick={() => handleSelectChoice(choiceIndex)}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left text-lg font-medium text-text shadow-sm transition disabled:cursor-not-allowed ${style}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-track text-sm font-bold text-text2">
                  {THAI_LETTERS[choiceIndex] ?? choiceIndex + 1}
                </span>
                {choiceText}
              </button>
            );
          })}
        </div>

        {result && (
          <div
            className={`rounded-2xl border p-4 text-center ${
              result.correct ? "border-gold-dim bg-amber/10 text-gold-hi" : "border-red bg-red/10 text-red"
            }`}
          >
            {result.correct ? (
              <p className="animate-bounce text-lg font-bold">
                ถูกต้อง! 🎉 ได้ +{result.expEarned} EXP
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-lg font-bold">ยังไม่ถูกนะ ไม่เป็นไร!</p>
                <p className="text-sm">
                  เฉลย: {THAI_LETTERS[result.correctIndex]}. {current.choices[result.correctIndex]}
                </p>
                {result.explanation && <p className="text-sm">{result.explanation}</p>}
              </div>
            )}
          </div>
        )}

        {result && (
          <button
            type="button"
            onClick={handleNext}
            disabled={isPending}
            className="rounded-2xl border border-gold bg-amber py-4 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
          >
            {isPending ? "กำลังบันทึก..." : isLastQuestion ? "ดูสรุปผล" : "ข้อต่อไป"}
          </button>
        )}
      </div>
    );
  }

  // phase === "summary"
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const roundExpEarned = answers.reduce((sum, a) => sum + a.expEarned, 0);

  return (
    <div className="flex flex-col gap-6 text-center">
      <div>
        <p className="text-6xl">{correctCount >= questions.length ? "🏆" : correctCount > 0 ? "🎊" : "💪"}</p>
        <h1 className="mt-2 text-2xl font-bold text-gold-hi">จบรอบแล้ว!</h1>
      </div>

      <div className="rounded-3xl border border-gold-dim bg-card p-6">
        <p className="text-lg text-text">
          ตอบถูก <span className="font-bold text-gold-hi">{correctCount}</span>/{questions.length} ข้อ
        </p>
        <p className="mt-2 text-lg text-text">
          ได้ EXP รวม <span className="font-bold text-amber">{roundExpEarned}</span> EXP
        </p>

        {summary?.capped && (
          <p className="mt-3 rounded-xl border border-amber-dim bg-amber/10 p-3 text-sm text-amber">
            🍚 Qmon ของเราอิ่มความรู้แล้ววันนี้ ได้เข้าตัวไป {summary.expAddedToPet} EXP พรุ่งนี้มาต่อกันนะ!
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handlePlayAgain}
          className="rounded-2xl border border-gold bg-amber py-4 text-lg font-bold text-track shadow-lg transition active:scale-95"
        >
          เล่นอีกรอบ
        </button>
        <button
          type="button"
          onClick={handleBackToSubjects}
          className="rounded-2xl border-2 border-border py-4 text-lg font-bold text-text2 transition active:scale-95"
        >
          ไปเลี้ยง Qmon
        </button>
      </div>
    </div>
  );
}
