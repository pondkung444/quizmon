"use client";

import { useState, useTransition } from "react";
import type { PublicQuestion, Subject } from "@/types/quiz";
import {
  startQuizRound,
  submitAnswer,
  finishQuizRound,
  type AnswerResult,
  type RoundFinishResult,
} from "@/app/quiz/actions";

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

const SUBJECTS: { id: Subject; label: string; emoji: string; gradient: string }[] = [
  { id: "math", label: "คณิตศาสตร์", emoji: "🧮", gradient: "from-sky-400 to-blue-600" },
  { id: "science", label: "วิทยาศาสตร์", emoji: "🔬", gradient: "from-emerald-400 to-teal-600" },
];

type Phase = "select" | "loading" | "playing" | "summary";

type AnsweredRecord = { isCorrect: boolean; expEarned: number };

export default function QuizClient() {
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
    resetRoundState();
    setSubject(null);
    setQuestions([]);
    setPhase("select");
  }

  if (phase === "select" || phase === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">เลือกวิชาที่จะฝึกวันนี้</h1>
          <p className="mt-1 text-sm text-gray-500">ตอบให้ถูกเยอะๆ แล้วไปเลี้ยงเพื่อนตัวน้อยกัน!</p>
        </div>

        {errorMessage && (
          <p className="rounded-xl bg-amber-100 p-3 text-center text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-100">
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
              className={`flex items-center justify-center gap-3 rounded-3xl bg-gradient-to-br ${s.gradient} px-6 py-10 text-2xl font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-60`}
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
          <div className="flex items-center justify-between text-sm font-medium text-gray-500">
            <span>ข้อที่ {index + 1}/{questions.length}</span>
            <span>{current.category}</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <h2 className="text-xl font-bold leading-relaxed">{current.question_text}</h2>

        <div className="flex flex-col gap-3">
          {current.choices.map((choiceText, choiceIndex) => {
            const isSelected = selectedChoice === choiceIndex;
            const isCorrectChoice = result && choiceIndex === result.correctIndex;
            const isWrongSelected = result && isSelected && !result.correct;

            let style =
              "border-gray-300 bg-white hover:border-sky-400 dark:border-gray-700 dark:bg-gray-900";
            if (isCorrectChoice) {
              style = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950";
            } else if (isWrongSelected) {
              style = "border-rose-500 bg-rose-50 dark:bg-rose-950";
            } else if (isSelected) {
              style = "border-sky-500 bg-sky-50 dark:bg-sky-950";
            }

            return (
              <button
                key={choiceIndex}
                type="button"
                data-testid="choice-button"
                disabled={!!result || isPending}
                onClick={() => handleSelectChoice(choiceIndex)}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left text-lg font-medium shadow-sm transition disabled:cursor-not-allowed ${style}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {THAI_LETTERS[choiceIndex] ?? choiceIndex + 1}
                </span>
                {choiceText}
              </button>
            );
          })}
        </div>

        {result && (
          <div
            className={`rounded-2xl p-4 text-center ${
              result.correct
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                : "bg-rose-100 text-rose-900 dark:bg-rose-900 dark:text-rose-100"
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
            className="rounded-2xl bg-indigo-600 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50"
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
        <h1 className="mt-2 text-2xl font-bold">จบรอบแล้ว!</h1>
      </div>

      <div className="rounded-3xl border-2 border-gray-200 p-6 dark:border-gray-800">
        <p className="text-lg">
          ตอบถูก <span className="font-bold text-emerald-600">{correctCount}</span>/{questions.length} ข้อ
        </p>
        <p className="mt-2 text-lg">
          ได้ EXP รวม <span className="font-bold text-indigo-600">{roundExpEarned}</span> EXP
        </p>

        {summary?.capped && (
          <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            🍚 สัตว์เลี้ยงของเราอิ่มความรู้แล้ววันนี้ ได้เข้าตัวไป {summary.expAddedToPet} EXP พรุ่งนี้มาต่อกันนะ!
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handlePlayAgain}
          className="rounded-2xl bg-indigo-600 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95"
        >
          เล่นอีกรอบ
        </button>
        <button
          type="button"
          onClick={handleBackToSubjects}
          className="rounded-2xl border-2 border-gray-300 py-4 text-lg font-bold text-gray-700 transition active:scale-95 dark:border-gray-700 dark:text-gray-200"
        >
          กลับหน้าหลัก
        </button>
      </div>
    </div>
  );
}
