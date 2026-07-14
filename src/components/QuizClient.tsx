"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuizRoundQuestion, QuizMode, Subject } from "@/types/quiz";
import {
  startQuizRound,
  submitAnswer,
  finishQuizRound,
  type RoundFinishResult,
} from "@/app/quiz/actions";
import { BASE_EXP_PER_CORRECT, calculateExpForAnswer, getComboMultiplier } from "@/lib/exp";
import StageUpModal from "@/components/StageUpModal";
import SpeechBubble from "@/components/SpeechBubble";
import { usePersonalityMessage, MESSAGE_DISPLAY_MS } from "@/hooks/usePersonalityMessage";
import type { PersonalityKey } from "@/lib/personality";
import type { PersonalityEventKey } from "@/lib/personalityMessages";
import { track } from "@/lib/analytics";

// ลำดับความสำคัญตอนหลาย event อยากโชว์พร้อมกัน (เช่น combo8 + gainExp + nearEvolution ในรอบเดียว):
// ทักทายกลับมา/เข้าเกม (ต้อนรับก่อนเจอความตื่นเต้นของรอบ) > คอมโบ > ใกล้วิวัฒนาการ > ได้ EXP ธรรมดา
// — ปรับลำดับได้ตรงนี้จุดเดียว (comeback/enterGame ไม่มีทางชนกันเอง เพราะ server เลือกอย่างใดอย่างหนึ่ง
// ให้แล้วเสมอ ให้ priority เท่ากันได้)
const QUIZ_EVENT_PRIORITY: Partial<Record<PersonalityEventKey, number>> = {
  comeback: 4,
  enterGame: 4,
  combo3: 3,
  combo5: 3,
  combo8: 3,
  nearEvolution: 2,
  gainExp: 1,
};

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

const MODES: { id: QuizMode; label: string; emoji: string }[] = [
  { id: "math", label: "คณิตศาสตร์", emoji: "🧮" },
  { id: "science", label: "วิทยาศาสตร์", emoji: "🔬" },
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
// category/subject แนบมาด้วยตอน ok — มาจาก DB จริงที่ submitAnswer ตรวจสอบตอนให้คะแนน (ไม่ใช่ค่าที่
// client ถืออยู่เอง) ใช้แนบ event question_answer ต่อ (ดู handleSelectChoice ด้านล่าง)
type BackgroundSubmission =
  | { ok: true; expEarned: number; category: string; subject: Subject }
  | { ok: false };

async function submitAnswerWithRetry(input: {
  questionId: number;
  choiceIndex: number;
  comboBefore: number;
  mode: QuizMode;
}): Promise<BackgroundSubmission> {
  try {
    const res = await submitAnswer(input);
    return { ok: true, expEarned: res.expEarned, category: res.category, subject: res.subject };
  } catch {
    try {
      const res = await submitAnswer(input);
      return { ok: true, expEarned: res.expEarned, category: res.category, subject: res.subject };
    } catch {
      return { ok: false };
    }
  }
}

export default function QuizClient({
  personalityKey,
  petAvatarPath,
  petEvolutionProgress = 0,
  petDailyCapped = false,
}: {
  personalityKey: PersonalityKey;
  petAvatarPath: string | null;
  petEvolutionProgress?: number;
  petDailyCapped?: boolean;
}) {
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
  // เวลาที่โจทย์ข้อปัจจุบันขึ้นจอ — ใช้คำนวณ time_used_ms ตอนตอบ (event question_answer)
  const questionShownAtRef = useRef<number>(0);
  // แถว quiz_attempts ล่าสุดของ user "ก่อน" รอบนี้เริ่ม (มาจาก startQuizRound) — ต้องส่งต่อให้
  // finishQuizRound ใช้เช็ค enterGame/comeback เพราะพอรอบนี้เริ่มตอบ จะมีแถวใหม่ของรอบนี้เอง
  // insert เข้าไปแล้ว ถ้าไปอ่านใหม่ตอนจบรอบจะเจอแถวตัวเองแทน
  const lastAttemptBeforeRoundRef = useRef<string | null>(null);

  const { message: personalityMessage, triggerEvent: triggerPersonalityEvent } =
    usePersonalityMessage(personalityKey);

  // event ในรอบ quiz อาจเกิดใกล้กันมาก (เช่น combo8 ข้อสุดท้ายของรอบ ตามด้วย gainExp/nearEvolution
  // ตอนจบรอบทันที) — คิวนี้กันไม่ให้ทับกัน โดยแสดงทีละอันเรียงตาม QUIZ_EVENT_PRIORITY แล้วเว้นจังหวะ
  // เท่ากับ MESSAGE_DISPLAY_MS ของ hook เอง (ให้ busy-window ของ hook หมดพอดีก่อนโชว์อันถัดไป)
  const eventQueueRef = useRef<PersonalityEventKey[]>([]);
  const queueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function processPersonalityQueue() {
    const next = eventQueueRef.current.shift();
    if (!next) {
      queueTimerRef.current = null;
      return;
    }
    triggerPersonalityEvent(next);
    queueTimerRef.current = setTimeout(processPersonalityQueue, MESSAGE_DISPLAY_MS);
  }

  function queuePersonalityEvent(event: PersonalityEventKey) {
    const priority = QUIZ_EVENT_PRIORITY[event] ?? 0;
    const queue = eventQueueRef.current;
    const insertAt = queue.findIndex((queued) => (QUIZ_EVENT_PRIORITY[queued] ?? 0) < priority);
    if (insertAt === -1) queue.push(event);
    else queue.splice(insertAt, 0, event);

    if (!queueTimerRef.current) processPersonalityQueue();
  }

  useEffect(() => {
    return () => {
      if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
    };
  }, []);

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
    // เริ่มรอบใหม่ = บริบทเปลี่ยน กันข้อความค้างจากรอบก่อนเด้งแทรกรอบใหม่แบบหลุดบริบท
    eventQueueRef.current = [];
    if (queueTimerRef.current) {
      clearTimeout(queueTimerRef.current);
      queueTimerRef.current = null;
    }
  }

  function handleSelectMode(nextMode: QuizMode) {
    resetRoundState();
    setMode(nextMode);
    setPhase("loading");
    startTransition(async () => {
      try {
        const { questions: round, currentCombo, lastAttemptBeforeRound } = await startQuizRound(nextMode);
        if (round.length === 0) {
          setErrorMessage("ยังไม่มีคำถามในโหมดนี้ ลองโหมดอื่นนะ");
          setPhase("select");
          return;
        }
        setQuestions(round);
        // sync คอมโบกับค่าจริงจาก server เสมอ (นับข้ามรอบได้ ไม่ hardcode 0)
        setCombo(currentCombo);
        lastAttemptBeforeRoundRef.current = lastAttemptBeforeRound;
        setPhase("playing");

        const firstQuestion = round[0];
        questionShownAtRef.current = Date.now();
        track("question_start", {
          question_id: firstQuestion.id,
          subject: firstQuestion.subject,
          category: firstQuestion.category,
        });
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
    // handleSelectChoice ถูกเรียกจาก onClick เท่านั้น (ไม่มีทางถูกเรียกระหว่าง render) —
    // eslint-disable-next-line react-hooks/purity
    const timeUsedMs = Date.now() - questionShownAtRef.current;
    const newCombo = isCorrect ? combo + 1 : 0;
    // ตัวเลข EXP นี้เป็นค่าประมาณชั่วคราว (สมมติ accuracy multiplier = 1.0) โชว์ให้เห็นทันที
    // ระหว่างเล่น ค่าจริงที่ผ่านการเช็ค accuracy multiplier จาก DB จะมาจาก server ตอนสรุปท้ายรอบ
    const optimisticExp = calculateExpForAnswer(
      isCorrect,
      1.0,
      getComboMultiplier(newCombo),
      BASE_EXP_PER_CORRECT
    );

    // เด้งเฉพาะตอน "แตะพอดี" 3/5/8 (ไม่ใช่ >=) กันเด้งซ้ำทุกข้อหลังจากนั้น — ตอบผิดรีเซ็ต
    // combo กลับ 0 แล้ว ไต่ขึ้นไปแตะ 3 ใหม่ได้อีกครั้ง ถือเป็นคอมโบใหม่
    if (newCombo === 3) queuePersonalityEvent("combo3");
    else if (newCombo === 5) queuePersonalityEvent("combo5");
    else if (newCombo === 8) queuePersonalityEvent("combo8");

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

    // .then() แยกต่างหากบน promise เดิม — แค่ "แอบดู" ผลลัพธ์ ไม่ได้ไปแก้ submissionQueueRef/
    // pendingSubmissionsRef เอง จึงไม่กระทบคิวจริงหรือ finishQuizRound ที่รอ Promise.all อยู่
    submissionPromise.then((res) => {
      if (!res.ok) return;
      track("question_answer", {
        question_id: current.id,
        category: res.category,
        subject: res.subject,
        is_correct: isCorrect,
        time_used_ms: timeUsedMs,
        difficulty: current.difficulty,
      });
    });
  }

  function handleNext() {
    const isLastQuestion = index + 1 >= questions.length;

    if (!isLastQuestion) {
      const nextQuestion = questions[index + 1];
      // handleNext ถูกเรียกจาก onClick เท่านั้น (ไม่มีทางถูกเรียกระหว่าง render) —
      // eslint-disable-next-line react-hooks/purity
      questionShownAtRef.current = Date.now();
      track("question_start", {
        question_id: nextQuestion.id,
        subject: nextQuestion.subject,
        category: nextQuestion.category,
      });
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
      const finishResult = await finishQuizRound(roundExpEarned, lastAttemptBeforeRoundRef.current);
      setSummary(finishResult);
      setPhase("summary");

      // ทักทายก่อนเสมอ (ดู QUIZ_EVENT_PRIORITY) — enterGame/comeback fire เฉพาะรอบแรกของวันเท่านั้น
      if (finishResult.greetingEvent) queuePersonalityEvent(finishResult.greetingEvent);
      // gainExp เฉพาะตอนมี exp เข้าตัวสัตว์จริง — โดน cap เต็มจนไม่ได้เข้าเลยไม่เด้ง (กันหลอกผู้เล่น)
      if (finishResult.nearEvolution) queuePersonalityEvent("nearEvolution");
      if (finishResult.expAddedToPet > 0) queuePersonalityEvent("gainExp");

      if (finishResult.evolved) {
        track(
          "stage_up",
          { from_stage: finishResult.fromStage, to_stage: finishResult.toStage },
          finishResult.petId
        );
      }
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
              className="flex items-center justify-center gap-3 rounded-3xl border border-gold-dim bg-card px-6 py-10 text-2xl font-bold text-gold-hi shadow-lg transition hover:border-gold active:scale-95 disabled:opacity-60"
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

        <SpeechBubble
          message={personalityMessage}
          avatarPath={petAvatarPath}
          evolutionProgress={petEvolutionProgress}
          dailyCapped={petDailyCapped}
        />

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

      <div className="flex justify-center">
        <SpeechBubble
          message={personalityMessage}
          avatarPath={petAvatarPath}
          evolutionProgress={petEvolutionProgress}
          dailyCapped={petDailyCapped}
        />
      </div>

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
