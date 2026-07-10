"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuizRoundQuestion, QuizMode } from "@/types/quiz";
import {
  startQuizRound,
  submitAnswer,
  finishQuizRound,
  type RoundFinishResult,
} from "@/app/quiz/actions";
import {
  BASE_EXP_PER_CORRECT,
  MIDTERM_BASE_EXP_PER_CORRECT,
  calculateExpForAnswer,
  getComboMultiplier,
} from "@/lib/exp";
import StageUpModal from "@/components/StageUpModal";

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

const MODES: { id: QuizMode; label: string; emoji: string }[] = [
  { id: "math", label: "คณิตศาสตร์", emoji: "🧮" },
  { id: "science", label: "วิทยาศาสตร์", emoji: "🔬" },
  { id: "midterm", label: "ติวสอบกลางภาค", emoji: "📝" },
];

type Phase = "select" | "loading" | "playing" | "summary";

type AnsweredRecord = { isCorrect: boolean; expEarned: number };

// ผลที่โชว์ทันทีตอนกดตอบ — เทียบกับเฉลยที่มากับคำถามใน state เอง (ไม่รอ server)
type LocalAnswerResult = {
  correct: boolean;
  correctIndex: number;
  explanation: string | null;
  expEarned: number;
};

// บันทึกคำตอบไปหลังบ้านแบบไม่ block UI แต่เก็บ promise ไว้รอตอนจบรอบ (Promise.all)
type BackgroundSubmission = { ok: true; expEarned: number } | { ok: false };

async function submitAnswerWithRetry(input: {
  questionId: number;
  choiceIndex: number;
  comboBefore: number;
  mode: QuizMode;
}): Promise<BackgroundSubmission> {
  try {
    const res = await submitAnswer(input);
    return { ok: true, expEarned: res.expEarned };
  } catch {
    try {
      const res = await submitAnswer(input);
      return { ok: true, expEarned: res.expEarned };
    } catch {
      return { ok: false };
    }
  }
}

export default function QuizClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("select");
  const [mode, setMode] = useState<QuizMode | null>(null);
  const [questions, setQuestions] = useState<QuizRoundQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [result, setResult] = useState<LocalAnswerResult | null>(null);
  const [combo, setCombo] = useState(0);
  const [answers, setAnswers] = useState<AnsweredRecord[]>([]);
  const [finalExpEarned, setFinalExpEarned] = useState(0);
  const [summary, setSummary] = useState<RoundFinishResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const pendingSubmissionsRef = useRef<Promise<BackgroundSubmission>[]>([]);
  // คำขอจริงไปเซิร์ฟเวอร์ต้องเข้าคิวทีละตัว (กัน race condition ตอนอัปเดต pets แบบ
  // read-then-write) — แต่ละ submission ต่อท้าย queue นี้ ไม่ได้ยิงพร้อมกัน
  const submissionQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  function resetRoundState() {
    setIndex(0);
    setSelectedChoice(null);
    setResult(null);
    setCombo(0);
    setAnswers([]);
    setFinalExpEarned(0);
    setSummary(null);
    setErrorMessage(null);
    setSaveWarning(null);
    pendingSubmissionsRef.current = [];
    submissionQueueRef.current = Promise.resolve();
  }

  function handleSelectMode(nextMode: QuizMode) {
    resetRoundState();
    setMode(nextMode);
    setPhase("loading");
    startTransition(async () => {
      try {
        const { questions: round, currentCombo } = await startQuizRound(nextMode);
        if (round.length === 0) {
          setErrorMessage("ยังไม่มีคำถามในโหมดนี้ ลองโหมดอื่นนะ");
          setPhase("select");
          return;
        }
        setQuestions(round);
        // sync คอมโบกับค่าจริงจาก server เสมอ (นับข้ามรอบได้ ไม่ hardcode 0)
        setCombo(currentCombo);
        setPhase("playing");
      } catch {
        setErrorMessage("โหลดคำถามไม่สำเร็จ ลองใหม่อีกครั้งนะ");
        setPhase("select");
      }
    });
  }

  function handleSelectChoice(choiceIndex: number) {
    if (result || isPending) return;
    const current = questions[index];
    const isCorrect = choiceIndex === current.correctIndex;
    const newCombo = isCorrect ? combo + 1 : 0;
    // ตัวเลข EXP นี้เป็นค่าประมาณชั่วคราว (สมมติ accuracy multiplier = 1.0) โชว์ให้เห็นทันที
    // ระหว่างเล่น ค่าจริงที่ผ่านการเช็ค accuracy multiplier จาก DB จะมาจาก server ตอนสรุปท้ายรอบ
    const basePoints = mode === "midterm" ? MIDTERM_BASE_EXP_PER_CORRECT : BASE_EXP_PER_CORRECT;
    const optimisticExp = calculateExpForAnswer(isCorrect, 1.0, getComboMultiplier(newCombo), basePoints);

    setSelectedChoice(choiceIndex);
    setCombo(newCombo);
    setResult({
      correct: isCorrect,
      correctIndex: current.correctIndex,
      explanation: current.explanation,
      expEarned: optimisticExp,
    });
    setAnswers((prev) => [...prev, { isCorrect, expEarned: optimisticExp }]);

    // บันทึกจริงไปหลังบ้าน ไม่ await ตรงนี้ (UI ไม่รอ) — แต่ยิงคำขอจริงเรียงคิวทีละตัว
    // ต่อท้าย submissionQueueRef เสมอ กันสองคำขอชนกันตอนอัปเดต pets (read-then-write)
    const submissionPromise = submissionQueueRef.current.then(() =>
      submitAnswerWithRetry({
        questionId: current.id,
        choiceIndex,
        comboBefore: combo,
        mode: mode!,
      })
    );
    submissionQueueRef.current = submissionPromise;
    pendingSubmissionsRef.current[index] = submissionPromise;
  }

  function handleNext() {
    const isLastQuestion = index + 1 >= questions.length;

    if (!isLastQuestion) {
      setIndex((i) => i + 1);
      setSelectedChoice(null);
      setResult(null);
      return;
    }

    startTransition(async () => {
      const submissions = await Promise.all(pendingSubmissionsRef.current);
      const anyFailed = submissions.some((s) => !s.ok);
      if (anyFailed) {
        setSaveWarning("รอบนี้บันทึกผลไม่ครบทุกข้อ (เน็ตอาจหลุด) ตัวเลขด้านล่างอาจไม่ตรงเป๊ะ แต่เล่นต่อได้เลยนะ");
      }
      const roundExpEarned = submissions.reduce(
        (sum, s, i) => sum + (s.ok ? s.expEarned : answers[i].expEarned),
        0
      );
      setFinalExpEarned(roundExpEarned);
      const finishResult = await finishQuizRound(roundExpEarned);
      setSummary(finishResult);
      setPhase("summary");
    });
  }

  function handlePlayAgain() {
    if (mode) handleSelectMode(mode);
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
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={phase === "loading"}
              onClick={() => handleSelectMode(m.id)}
              className={
                m.id === "midterm"
                  ? "flex items-center justify-center gap-3 rounded-3xl border border-indigo-dim bg-card px-6 py-10 text-2xl font-bold text-indigo-hi shadow-lg transition hover:border-indigo active:scale-95 disabled:opacity-60"
                  : "flex items-center justify-center gap-3 rounded-3xl border border-gold-dim bg-card px-6 py-10 text-2xl font-bold text-gold-hi shadow-lg transition hover:border-gold active:scale-95 disabled:opacity-60"
              }
            >
              <span className="text-4xl">{m.emoji}</span>
              {phase === "loading" && mode === m.id ? "กำลังสุ่มคำถาม..." : m.label}
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
  const roundExpEarned = finalExpEarned;

  return (
    <div className="flex flex-col gap-6 text-center">
      {summary?.reachedStage4 && <StageUpModal onClose={() => router.push("/pet")} />}

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

        {saveWarning && (
          <p className="mt-3 rounded-xl border border-red bg-red/10 p-3 text-sm text-red">
            ⚠️ {saveWarning}
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
