"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { startRaidBoss, answerRaidBoss } from "@/app/raid/actions";
import RaidScene from "@/components/raid/RaidScene";
import { getSpriteAspectRatio } from "@/lib/raid/spriteGroundOffsets";
import { QuestionImage } from "@/components/QuizClient";

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

// พิกัดสไปรต์ในฉากเต็มจอ (feedback redesign 2026-08-10) — Qmon ชิดซ้ายกว่าเดิม (14% ไม่ใช่ 22%)
// บอสชิดขวากว่าเดิม (leftPercent 92% = "8% จากขวา" ไม่ใช่ 76%) ให้มีพื้นที่หายใจสำหรับ HUD ลอย
// มุมบน/ล่างของจอเต็มความสูงแบบใหม่ ไม่ใช่กรอบการ์ด aspect-[8/3] เดิม ส่วนเส้นพื้น (top 82%) เป็นค่า
// hardcode ใน RaidScene.tsx เอง ไม่ได้ส่งผ่าน prop จึงต้องอ้างอิงเลข 82 ซ้ำตรงนี้เพื่อคำนวณตำแหน่ง
// streak bar/ป้ายชื่อลอยเหนือ/ใต้สไปรต์ให้ตรงกับเส้นพื้นเดียวกัน
const GROUND_TOP_PCT = 82;
const PET_LEFT_PCT = 14;
const PET_HEIGHT_PCT = 26;

// feedback สด 2026-08-10 (ระหว่างทดสอบจริง): "บอสต้องใหญ่กว่า Qmon" ตามด้วย "ตกขอบไปไกลมาก" — บอส
// สี่เหลี่ยมจัตุรัส (boss_ridge_gale.png 1254×1254 อัตราส่วน 1:1) ที่ leftPercent 92% + heightPercent
// 78% แบบเดิม (คิดความกว้างจาก % ของความสูง container ตรงๆ) ล้นขอบขวาไปไกลบนจอที่ไม่ได้กว้างมาก — ยิ่ง
// แคบ/สูงขึ้น (มือถือจริง) ยิ่งล้นหนักเพราะ % ของความสูงไม่สนใจความกว้างจอเลย แม้แต่บอสแนวตั้ง (จิ้งจอก/
// หมาป่า อัตราส่วน 0.667) ก็ล้นได้บนจอแคบพอ ไม่ใช่แค่ตัวที่เป็นสี่เหลี่ยมจัตุรัส
// แก้ด้วย heightCss: min(<ความสูงปกติ>vh, calc(<ความกว้างสูงสุด>vw / อัตราส่วนภาพ)) — เทียบทั้งสอง
// เงื่อนไขพร้อมกันจาก vh/vw ตรงๆ (ไม่ใช่ % ของ container ที่ไม่รู้อัตราส่วนจอ) ได้ค่าที่เล็กกว่าเสมอ
// ดังนั้นความกว้างจริงจะไม่มีทางเกิน BOSS_MAX_WIDTH_VW ไม่ว่าจออัตราส่วนไหนหรือรูปสัดส่วนอะไรก็ตาม —
// leftPercent ต้องปรับให้เหลือระยะขอบขวาพอสำหรับความกว้างสูงสุดนี้ด้วย (ครึ่งความกว้างสูงสุด = 31%
// ต้อง left ไม่เกิน 100-31=69 ถึงจะชิดขอบขวาพอดีไม่ล้น เผื่อระยะไว้เป็น 68)
const BOSS_LEFT_PCT = 68;
const BOSS_NORMAL_HEIGHT_VH = 78;
const BOSS_MAX_WIDTH_VW = 62;

function getBossHeightCss(bossSpritePath: string | null): string {
  if (!bossSpritePath) return `${BOSS_NORMAL_HEIGHT_VH}vh`;
  const ratio = getSpriteAspectRatio(bossSpritePath);
  return `min(${BOSS_NORMAL_HEIGHT_VH}vh, calc(${BOSS_MAX_WIDTH_VW}vw / ${ratio}))`;
}

// TODO(ปอนด์ — content session แยกต่างหาก): คำพูดบอสตอนนี้เป็น placeholder ทั้งหมด รอเนื้อหาจริง
const BOSS_LINES_CORRECT = ["โฮก! เจ็บไปนะเนี่ย", "ยังไม่ยอมง่ายๆ หรอกนะ!", "แข็งแกร่งจริง..."];
const BOSS_LINES_WRONG = ["ยังไม่พอหรอก!", "ลองอีกทีนะ", "โจมตีไม่เข้าเลย"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type BossQuestionView = {
  seq: number;
  questionId: number;
  questionText: string;
  choices: string[];
  imageUrl: string | null;
  answered: boolean;
  isCorrect: boolean | null;
};

type LocalAnswer = { isCorrect: boolean; correctIndex: number; explanation: string | null };

// จอบอส 5 ข้อ — ไม่ import จาก QuizClient เช่นเดียวกับจอคำถามแก้ตัว ดึงคำถาม 5 ข้อครั้งเดียวตอนเข้าจอ
// (startRaidBoss เป็น idempotent เรียกซ้ำได้ ไม่ดึงคำถามใหม่) แล้วเดินหน้าทีละข้อ ตอบข้อไหนไปแล้ว
// ข้ามไปข้อถัดไปที่ยังไม่ตอบเสมอ — resume กลางบอส (ตอบไป 3 จาก 5) จะโผล่มาที่ข้อ 4 ต่อเองจากตรงนี้
//
// โฉมใหม่ (redesign 2026-08-10): สองโหมดสลับเต็มจอ "scene"/"question" ไม่แชร์พื้นที่กัน — เดินหน้า
// ข้อ 2-5 ทำแบบ local state ล้วนๆ (localAnswers) ไม่ต้อง router.refresh() ทุกข้อเหมือนเดิมอีกต่อไป
// เพราะคำถามทั้ง 5 ข้อถูกส่งมาครบใน props ตั้งแต่แรกอยู่แล้ว (ต่างจากเดิมที่พึ่ง remount ทั้งก้อนต่อข้อ
// ผ่าน key `${runId}-${answeredCount}` ใน RaidClient.tsx) เหลือแค่ข้อสุดท้าย ("ดูสรุปผล") เท่านั้นที่ยัง
// เรียก router.refresh() จริง เพื่อให้ server ตัดสิน phase ถัดไป (reward)
export default function RaidBossScreen({
  runId,
  bossPassCount,
  bossQuestionCount,
  bossNameTh,
  backgroundPath,
  bossScenePath,
  bossSpritePath,
  petImagePath,
  questions,
}: {
  runId: string;
  gaugeEarned: number;
  gaugeMax: number;
  bossPassCount: number;
  bossQuestionCount: number;
  bossNameTh: string | null;
  backgroundPath: string | null;
  bossScenePath: string | null;
  bossSpritePath: string | null;
  petImagePath: string | null;
  thresholdPct: number;
  questions: BossQuestionView[];
}) {
  const router = useRouter();
  const startedRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mode, setMode] = useState<"scene" | "question">("scene");
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  const [localAnswers, setLocalAnswers] = useState<Record<number, LocalAnswer>>({});
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [result, setResult] = useState<LocalAnswer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  // เพิ่มทุกครั้งที่มีผลตอบใหม่ ใช้เป็น key ให้สไปรต์ remount แล้วอนิเมชัน hit/flinch เล่นซ้ำได้
  // ทุกข้อ (1-5) — วิธีนี้กันปัญหา CSS animation ไม่ replay ถ้า class เดิมไม่เปลี่ยนระหว่าง render
  const [hitKey, setHitKey] = useState(0);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [speechText, setSpeechText] = useState<string | null>(
    bossNameTh ? `${bossNameTh} ยืนรอทดสอบอยู่ปลายทาง` : null
  );

  // แก้บั๊กค้างโหลด (2026-08-10): เดิมเช็คผ่าน isLoading state ที่ตั้งค่าแค่ตอน mount ครั้งเดียว —
  // พอ startRaidBoss สำเร็จแล้ว router.refresh() ส่ง questions ใหม่มา แต่ key ของ component ใน
  // RaidClient.tsx ไม่เปลี่ยน (ยังไม่มีใครตอบข้อไหนเลย) ทำให้ component ไม่ remount, isLoading เก่า
  // ค้าง true ตลอดไปทั้งที่คำถามพร้อมแล้วจริงๆ (ยืนยันจาก DB: pulled_at ตรงเวลา ไม่มี answered_at
  // เลยสักข้อ) ตอนนี้เช็คจาก questions.length === 0 ตรงๆ ทุกจุดแทน ไม่มี state ค้างแบบนี้ได้อีก
  // คำถามมาถึงแล้ว (ไม่ว่าจะจาก refresh สำเร็จ หรือกด "ลองใหม่" เอง) — เคลียร์ตัวจับเวลา retry
  // ที่ค้างอยู่ทิ้ง ไม่ต้อง setState รีเซ็ต showRetry เพราะปุ่มลองใหม่ถูก gate ด้วย
  // questions.length === 0 อยู่แล้วที่จุดเรนเดอร์ ไม่มีทางโผล่มาให้เห็นซ้ำ
  useEffect(() => {
    if (questions.length === 0) return;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, [questions.length]);

  useEffect(() => {
    if (questions.length > 0 || startedRef.current) return;
    startedRef.current = true;
    startRaidBoss(runId)
      .then(() => {
        router.refresh();
        // safeguard: เคยเจอปัญหา router.refresh() ล้มเหลวเงียบๆ ใน Next.js 16.2.10 canary — ถ้า
        // คำถามยังไม่มาใน 8 วิ โชว์ปุ่ม "ลองใหม่" แทนสปินเนอร์ค้างตลอดไป
        retryTimeoutRef.current = setTimeout(() => setShowRetry(true), 8000);
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "เริ่มคำถามบอสไม่สำเร็จ");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, runId]);

  useEffect(
    () => () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    },
    []
  );

  function handleRetryClick() {
    setShowRetry(false);
    setErrorMessage(null);
    router.refresh();
    retryTimeoutRef.current = setTimeout(() => setShowRetry(true), 8000);
  }

  const mergedQuestions = questions.map((q) => {
    const local = localAnswers[q.seq];
    if (!local) return q;
    return { ...q, answered: true, isCorrect: local.isCorrect };
  });
  const current = mergedQuestions.find((q) => !q.answered) ?? null;
  const answeredCount = mergedQuestions.filter((q) => q.answered).length;
  const correctCount = mergedQuestions.filter((q) => q.isCorrect).length;
  const sheetQuestion = activeSeq !== null ? questions.find((q) => q.seq === activeSeq) ?? null : null;

  const bossHealthPct = bossQuestionCount > 0 ? Math.max(0, 100 - (correctCount / bossQuestionCount) * 100) : 100;
  const remainingToWin = Math.max(bossPassCount - correctCount, 0);
  const effectiveBackgroundPath = bossScenePath ?? backgroundPath;

  async function handleSelect(choiceIndex: number) {
    if (!sheetQuestion || selectedChoice !== null || isSubmitting) return;
    const seq = sheetQuestion.seq;
    setSelectedChoice(choiceIndex);
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await answerRaidBoss(runId, seq, choiceIndex);
      const localResult: LocalAnswer = {
        isCorrect: res.isCorrect,
        correctIndex: res.correctIndex,
        explanation: res.explanation,
      };
      setResult(localResult);
      // รอสั้นๆ ให้เห็นไฮไลต์ถูก/ผิดก่อน แล้วสไลด์ปิดกลับไปโหมดฉากอัตโนมัติ ไม่ต้องมีปุ่ม "ดูผล" แยก
      setTimeout(() => {
        setLocalAnswers((prev) => ({ ...prev, [seq]: localResult }));
        setLastCorrect(localResult.isCorrect);
        setHitKey((k) => k + 1);
        setSpeechText(pickRandom(localResult.isCorrect ? BOSS_LINES_CORRECT : BOSS_LINES_WRONG));
        setMode("scene");
        setSelectedChoice(null);
        setResult(null);
        setIsSubmitting(false);
        setActiveSeq(null);
      }, 700);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ตอบคำถามไม่สำเร็จ");
      setSelectedChoice(null);
      setIsSubmitting(false);
    }
  }

  function handleContinue() {
    setIsAdvancing(true);
    router.refresh();
  }

  function handleCtaClick() {
    if (!current) {
      handleContinue();
      return;
    }
    setActiveSeq(current.seq);
    setMode("question");
  }

  const ctaLabel = !current ? "ดูสรุปผล" : answeredCount === 0 ? "เจอคำถามข้อแรก" : "ข้อต่อไป";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-track">
      <div className="relative h-full w-full">
        <RaidScene
          fullScreen
          backgroundPath={effectiveBackgroundPath}
          sprites={[
            ...(petImagePath
              ? [
                  {
                    imagePath: petImagePath,
                    leftPercent: PET_LEFT_PCT,
                    heightPercent: PET_HEIGHT_PCT,
                    animationClass: lastCorrect === false ? "animate-qmon-flinch" : "animate-dungeon-walk-bob",
                    spriteKey: `pet-${hitKey}`,
                  },
                ]
              : []),
            ...(bossSpritePath
              ? [
                  {
                    imagePath: bossSpritePath,
                    leftPercent: BOSS_LEFT_PCT,
                    heightPercent: BOSS_NORMAL_HEIGHT_VH,
                    heightCss: getBossHeightCss(bossSpritePath),
                    animationClass: lastCorrect === true ? "animate-boss-hit" : "animate-boss-idle-breathe",
                    alt: bossNameTh ?? "",
                    spriteKey: `boss-${hitKey}`,
                  },
                ]
              : []),
          ]}
        />

        <button
          type="button"
          onClick={() => router.push("/pet")}
          className="absolute left-3 top-3 z-10 flex h-10 items-center gap-1 rounded-full border border-white/20 bg-black/40 px-3 text-sm font-medium text-text backdrop-blur-sm transition active:scale-95"
        >
          <ChevronLeft size={16} />
          <span>บ้าน</span>
        </button>

        {bossNameTh && (
          <div className="absolute right-3 top-3 z-10 w-40 rounded-2xl border border-white/10 bg-black/40 p-2.5 backdrop-blur-sm">
            <p className="truncate text-right text-sm font-bold text-gold-hi">{bossNameTh}</p>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full bg-red transition-all" style={{ width: `${bossHealthPct}%` }} />
            </div>
            <p className="mt-1 text-right text-[11px] text-text2">
              {remainingToWin > 0 ? `ต้องตอบถูกอีก ${remainingToWin} ข้อ` : "ถึงเกณฑ์ชนะแล้ว!"}
            </p>
          </div>
        )}

        {petImagePath && (
          <>
            <div
              className="absolute z-10 flex -translate-x-1/2 gap-1"
              style={{ left: `${PET_LEFT_PCT}%`, top: `calc(${GROUND_TOP_PCT - PET_HEIGHT_PCT}% - 14px)` }}
            >
              {mergedQuestions.map((q) => (
                <span
                  key={q.seq}
                  className={`h-1.5 w-3 rounded-full ${
                    q.answered ? (q.isCorrect ? "bg-gold" : "bg-indigo-dim") : "bg-track"
                  }`}
                />
              ))}
            </div>
            <span
              className="absolute z-10 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-text2"
              style={{ left: `${PET_LEFT_PCT}%`, top: `calc(${GROUND_TOP_PCT}% + 6px)` }}
            >
              Qmon
            </span>
          </>
        )}

        {bossSpritePath && bossNameTh && (
          <span
            className="absolute z-10 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-text2"
            style={{ left: `${BOSS_LEFT_PCT}%`, top: `calc(${GROUND_TOP_PCT}% + 6px)` }}
          >
            {bossNameTh}
          </span>
        )}

        {speechText && (
          <div
            key={hitKey}
            className="animate-speech-pop absolute right-4 top-20 z-10 max-w-[65%] rounded-2xl rounded-tr-sm border border-gold-dim bg-card/95 px-3 py-2 text-sm font-medium text-text shadow-lg"
          >
            {speechText}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-5 pt-12">
          {questions.length === 0 ? (
            <>
              {errorMessage && <p className="text-center text-sm font-medium text-red">{errorMessage}</p>}
              {showRetry ? (
                <button
                  type="button"
                  onClick={handleRetryClick}
                  className="w-full max-w-sm rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
                >
                  ลองใหม่
                </button>
              ) : !errorMessage ? (
                <p className="flex items-center gap-2 text-sm font-medium text-text2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-text2 border-t-transparent motion-reduce:animate-none" />
                  กำลังเตรียมคำถาม...
                </p>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              disabled={isAdvancing}
              onClick={handleCtaClick}
              className="w-full max-w-sm rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              {isAdvancing ? "กำลังไปต่อ..." : ctaLabel}
            </button>
          )}
        </div>
      </div>

      <div
        className={`absolute inset-0 z-20 flex flex-col bg-card transition-transform duration-300 ease-out ${
          mode === "question" ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={mode !== "question"}
      >
        {sheetQuestion && (
          <div className="flex h-full flex-col overflow-y-auto p-5 pb-8">
            <div className="flex items-center justify-between">
              <span className="text-lg font-black text-indigo-hi">
                ข้อที่ {answeredCount + 1}/{bossQuestionCount}
              </span>
              <span className="text-lg font-black text-gold-hi">ตอบถูกแล้ว {correctCount} ข้อ</span>
            </div>
            <div className="mt-3 flex gap-1.5">
              {mergedQuestions.map((q) => (
                <span
                  key={q.seq}
                  className={`h-2.5 flex-1 rounded-full ${
                    q.answered ? (q.isCorrect ? "bg-gold" : "bg-indigo-dim") : "bg-track"
                  }`}
                />
              ))}
            </div>

            <h2 className="mt-5 font-sarabun text-xl font-bold leading-relaxed text-text">{sheetQuestion.questionText}</h2>

            {sheetQuestion.imageUrl && (
              <div className="mt-4">
                <QuestionImage key={sheetQuestion.questionId} src={sheetQuestion.imageUrl} />
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3">
              {sheetQuestion.choices.map((choiceText, choiceIndex) => {
                const isSelected = selectedChoice === choiceIndex;
                const isCorrectChoice = result && choiceIndex === result.correctIndex;
                const isWrongSelected = result && isSelected && !result.isCorrect;
                let style = "border-border bg-bg hover:border-gold-dim";
                if (isCorrectChoice) style = "border-gold bg-amber/10";
                else if (isWrongSelected) style = "border-red bg-red/10";
                else if (isSelected) style = "border-amber bg-amber/10";

                return (
                  <button
                    key={choiceIndex}
                    type="button"
                    disabled={selectedChoice !== null || isSubmitting}
                    onClick={() => handleSelect(choiceIndex)}
                    className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-4 text-left font-sarabun text-lg font-medium text-text shadow-sm transition disabled:cursor-not-allowed ${style}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-track text-sm font-bold text-text2">
                      {THAI_LETTERS[choiceIndex] ?? choiceIndex + 1}
                    </span>
                    <span>{choiceText}</span>
                  </button>
                );
              })}
            </div>

            {errorMessage && <p className="mt-4 text-center text-sm text-red">{errorMessage}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
