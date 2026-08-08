"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startRaidBoss, answerRaidBoss, type AnswerRaidBossResult } from "@/app/raid/actions";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import RaidScene from "@/components/raid/RaidScene";

const THAI_LETTERS = ["ก", "ข", "ค", "ง"];

type BossQuestionView = {
  seq: number;
  questionId: number;
  questionText: string;
  choices: string[];
  answered: boolean;
  isCorrect: boolean | null;
};

// จอบอส 5 ข้อ — ไม่ import จาก QuizClient เช่นเดียวกับจอคำถามแก้ตัว ดึงคำถาม 5 ข้อครั้งเดียวตอนเข้าจอ
// (startRaidBoss เป็น idempotent เรียกซ้ำได้ ไม่ดึงคำถามใหม่) แล้วเดินหน้าทีละข้อ ตอบข้อไหนไปแล้ว
// ข้ามไปข้อถัดไปที่ยังไม่ตอบเสมอ — resume กลางบอส (ตอบไป 3 จาก 5) จะโผล่มาที่ข้อ 4 ต่อเองจากตรงนี้
//
// ฉากเผชิญหน้า (feedback pass 2026-08-07): บอสต้องดูใหญ่/น่าเกรงขามชัดเจนกว่า Qmon (78% vs 26%
// ของความสูง container ไม่ใช่ 62%/34% แบบเดิมที่ใกล้เคียงกันเกินไป) ทั้งคู่มีเงาใต้เท้า (RaidScene
// วาดให้อัตโนมัติ) ยืนเส้นพื้นเดียวกัน (top 82%) Qmon หันหน้าเข้าหาบอส — สไปรต์ตัวสัตว์เลี้ยงในระบบนี้
// หันขวาเป็นค่าเริ่มต้นอยู่แล้ว (เดินไปทางขวาใน DungeonScene) บอสอยู่ทางขวาของจอพอดี จึงไม่ต้อง flip
export default function RaidBossScreen({
  runId,
  gaugeEarned,
  gaugeMax,
  bossPassCount,
  bossQuestionCount,
  bossNameTh,
  backgroundPath,
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
  bossSpritePath: string | null;
  petImagePath: string | null;
  thresholdPct: number;
  questions: BossQuestionView[];
}) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(questions.length === 0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerRaidBossResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // เพิ่มทุกครั้งที่มีผลตอบใหม่ ใช้เป็น key ให้สไปรต์ remount แล้วอนิเมชัน hit/flinch เล่นซ้ำได้
  // ทุกข้อ (1-5) — วิธีนี้กันปัญหา CSS animation ไม่ replay ถ้า class เดิมไม่เปลี่ยนระหว่าง render
  const [hitKey, setHitKey] = useState(0);

  useEffect(() => {
    if (questions.length > 0 || startedRef.current) return;
    startedRef.current = true;
    startRaidBoss(runId)
      .then(() => router.refresh())
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "เริ่มคำถามบอสไม่สำเร็จ");
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, runId]);

  const current = questions.find((q) => !q.answered) ?? null;
  const answeredCount = questions.filter((q) => q.answered).length;
  const correctCount = questions.filter((q) => q.isCorrect).length;

  async function handleSelect(choiceIndex: number) {
    if (!current || selectedChoice !== null || isSubmitting) return;
    setSelectedChoice(choiceIndex);
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await answerRaidBoss(runId, current.seq, choiceIndex);
      setResult(res);
      setHitKey((k) => k + 1);
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

  if (isLoading || questions.length === 0) {
    // ฉากต้องอยู่ครบเหมือนจอโหลดเสร็จแล้วทุกอย่าง (การ์ด + RaidScene ขนาดเดิมเป๊ะ) ห้ามยุบเหลือ
    // กล่องข้อความเล็กๆ กลางจอ — นั่นคือสาเหตุหลักที่กรอบ "กระโดด" ระหว่างโหลดคำถามบอส (feedback
    // pass 2026-08-08) เปลี่ยนเฉพาะส่วนคำถาม/ตัวเลือกด้านล่างเป็น skeleton แทน
    return (
      <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
        <AdventureHeader title="สู้บอส" subtitle={`ต้องตอบถูกอย่างน้อย ${bossPassCount} ใน ${bossQuestionCount} ข้อ`} />

        <div className="flex w-full flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-5">
          <RaidScene
            backgroundPath={backgroundPath}
            nameLabel={bossNameTh}
            sprites={[
              ...(petImagePath
                ? [{ imagePath: petImagePath, leftPercent: 22, heightPercent: 26, animationClass: "animate-dungeon-walk-bob" }]
                : []),
              ...(bossSpritePath
                ? [{ imagePath: bossSpritePath, leftPercent: 76, heightPercent: 78, animationClass: "animate-boss-idle-breathe", alt: bossNameTh ?? "" }]
                : []),
            ]}
          />

          <div className="h-16 animate-pulse rounded-2xl bg-track motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded-full bg-track motion-reduce:animate-none" />

          {errorMessage ? (
            <p className="text-center text-sm text-red">{errorMessage}</p>
          ) : (
            <p className="flex items-center justify-center gap-2 py-6 text-center text-sm text-text3">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-text3 border-t-transparent motion-reduce:animate-none" />
              กำลังเตรียมคำถาม...
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title="สู้บอส" subtitle={`ต้องตอบถูกอย่างน้อย ${bossPassCount} ใน ${bossQuestionCount} ข้อ`} />

      <div className="flex w-full flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-5">
        <RaidScene
          backgroundPath={backgroundPath}
          nameLabel={bossNameTh}
          sprites={[
            ...(petImagePath
              ? [
                  {
                    imagePath: petImagePath,
                    leftPercent: 22,
                    heightPercent: 26,
                    animationClass: result && !result.isCorrect ? "animate-qmon-flinch" : "animate-dungeon-walk-bob",
                    spriteKey: `pet-${hitKey}`,
                  },
                ]
              : []),
            ...(bossSpritePath
              ? [
                  {
                    imagePath: bossSpritePath,
                    leftPercent: 76,
                    heightPercent: 78,
                    animationClass: result?.isCorrect ? "animate-boss-hit" : "animate-boss-idle-breathe",
                    alt: bossNameTh ?? "",
                    spriteKey: `boss-${hitKey}`,
                  },
                ]
              : []),
          ]}
        />

        {/* จุดตื่นเต้นหลักของจอนี้ (ตามฟีดแบ็ก) — ต้องเด่นชัดกว่าเดิมมาก ไม่ใช่ตัวเลขจางๆ เล็กๆ อีก
            ต่อไป ห้ามมีข้อความกดดัน/นับถอยหลังแบบทำโทษเด็ดขาด (ไม่มี "อีกข้อเดียวจะแพ้แล้ว") */}
        <div className="rounded-2xl border border-indigo-dim bg-indigo/10 p-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-black text-indigo-hi">ข้อที่ {answeredCount + 1}/{bossQuestionCount}</span>
            <span className="text-lg font-black text-gold-hi">ตอบถูกแล้ว {correctCount} ข้อ</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {questions.map((q) => (
              <span
                key={q.seq}
                className={`h-2.5 flex-1 rounded-full ${
                  q.answered ? (q.isCorrect ? "bg-gold" : "bg-indigo-dim") : "bg-track"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="h-3 w-full overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-indigo transition-all"
            style={{ width: `${gaugeMax > 0 ? (gaugeEarned / gaugeMax) * 100 : 0}%` }}
          />
        </div>

        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

        {/* บรรทัดแนะนำก่อนคำถามข้อแรกเท่านั้น — ใช้ raid_types.boss_name_th ไม่ hardcode string */}
        {answeredCount === 0 && bossNameTh && (
          <p className="text-center text-sm font-bold text-gold-hi">{bossNameTh} ยืนรอทดสอบอยู่ปลายทาง</p>
        )}

        {current && (
          <>
            <h2 className="text-xl font-bold leading-relaxed text-text">{current.questionText}</h2>

            <div className="flex flex-col gap-3">
              {current.choices.map((choiceText, choiceIndex) => {
                const isSelected = selectedChoice === choiceIndex;
                const isCorrectChoice = result && choiceIndex === result.correctIndex;
                const isWrongSelected = result && isSelected && !result.isCorrect;
                let style = "border-border bg-card hover:border-gold-dim";
                if (isCorrectChoice) style = "border-gold bg-amber/10";
                else if (isWrongSelected) style = "border-red bg-red/10";
                else if (isSelected) style = "border-amber bg-amber/10";

                return (
                  <button
                    key={choiceIndex}
                    type="button"
                    disabled={selectedChoice !== null || isSubmitting}
                    onClick={() => handleSelect(choiceIndex)}
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
              <>
                <div
                  className={`rounded-2xl border p-4 text-center ${
                    result.isCorrect ? "border-gold-dim bg-amber/10 text-gold-hi" : "border-red bg-red/10 text-red"
                  }`}
                >
                  <p className="text-lg font-bold">{result.isCorrect ? "ถูกต้อง! 🎉" : "ยังไม่ถูกนะ ไม่เป็นไร!"}</p>
                  {result.explanation && <p className="mt-1 text-sm">{result.explanation}</p>}
                </div>

                <button
                  type="button"
                  disabled={isAdvancing}
                  onClick={handleContinue}
                  className="rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {isAdvancing ? "กำลังไปต่อ..." : result.isLast ? "ดูสรุปผล" : "ข้อต่อไป"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
