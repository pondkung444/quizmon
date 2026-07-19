"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  getStageUpContext,
  getPersonalityFoodDecision,
  choosePersonalityAfterEvolve,
  type StageUpContext,
} from "@/app/pet/actions";
import { getSpeciesName, getSublineBaseName, type Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import { PERSONALITY_LABEL } from "@/lib/labels";
import {
  pickRandomPersonalityQuestion,
  formatPersonalityPrompt,
  type PersonalityQuestion,
} from "@/lib/personalityQuestions";
import StatRadar from "@/components/StatRadar";

const MIN_ANIMATION_MS = 1100;

type Phase = "intro" | "question" | "submitting" | "reveal" | "error";

type Reveal = {
  personality: Personality;
  fullName: string;
  imagePath: string;
  stats: { hp: number; atk: number; def: number; spd: number; foc: number };
};

// เต็มจอ ไม่ใช่ toast — เรียกตอน finishQuizRound ตรวจพบ stage 3→4 (จาก QuizClient) หรือตอนผู้เล่น
// กลับมาตอบต่อจากสถานะ "รอตอบคำถาม" บน /pet (จาก PendingPersonalityCard) — สองทางเข้าเดียวกันหมด
// ลำดับ: a) แอนิเมชันสั้นๆ b) เช็คอาหารสะสม (majority vote) — ตัดสินได้เลยไม่ถามคำถาม / เสมอค่อยสุ่ม
// คำถาม fallback c) เลือก/ตัดสินแล้ว -> ล็อก personality + snapshot stat d) เผยผล e) ปิด
export default function PersonalityDecisionModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [context, setContext] = useState<StageUpContext | null>(null);
  const [question] = useState<PersonalityQuestion>(() => pickRandomPersonalityQuestion());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastChoice, setLastChoice] = useState<Personality | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  useEffect(() => {
    let cancelled = false;
    let minAnimDone = false;
    let fetchedContext: StageUpContext | null | "pending" = "pending";
    let decidedPersonality: Personality | null | "pending" = "pending";

    function tryAdvance() {
      if (cancelled || !minAnimDone || fetchedContext === "pending" || decidedPersonality === "pending") return;
      if (fetchedContext === null) {
        // ไม่มีคำถามค้าง (เช่นเลือกไปแล้วจากแท็บ/รอบอื่น) — ปิดจอเงียบๆ ไม่ใช่ error
        onClose();
        return;
      }
      setContext(fetchedContext);
      if (decidedPersonality) {
        // อาหารสะสมตัดสินได้เลย (ไม่เสมอ) — ล็อกตรงๆ ไม่ต้องถามคำถาม
        submit(decidedPersonality, fetchedContext);
      } else {
        setPhase("question");
      }
    }

    const timer = setTimeout(() => {
      minAnimDone = true;
      tryAdvance();
    }, MIN_ANIMATION_MS);

    Promise.all([getStageUpContext(), getPersonalityFoodDecision()])
      .then(([ctx, decision]) => {
        if (cancelled) return;
        fetchedContext = ctx;
        decidedPersonality = decision.decided ? decision.personality : null;
        tryAdvance();
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
        setPhase("error");
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // ตั้งใจรันครั้งเดียวตอน mount เท่านั้น — onClose มาจาก parent และไม่ควรรีสตาร์ทลำดับนี้ถ้าเปลี่ยน identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(choice: Personality, ctx: StageUpContext) {
    setLastChoice(choice);
    setPhase("submitting");
    setErrorMessage(null);
    choosePersonalityAfterEvolve(choice)
      .then((result) => {
        setReveal({
          personality: result.personality,
          fullName: getSpeciesName(ctx.spritePrefix, 4, ctx.subline, result.personality, ctx.eggNameTh),
          imagePath: getPetImagePath(ctx.spritePrefix, 4, ctx.subline, result.personality),
          stats: result.stats,
        });
        setPhase("reveal");
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "เลือกบุคลิกไม่สำเร็จ");
        setPhase("error");
      });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
        {phase === "intro" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <span className="absolute h-28 w-28 animate-ping rounded-full bg-amber opacity-30" />
              <span className="text-5xl">✨</span>
            </div>
            <p className="text-lg font-bold text-gold-hi">กำลังวิวัฒนาการ...</p>
          </div>
        )}

        {phase === "question" && context && (
          <>
            <p className="text-sm text-text3">ระยะ 4 · เลือกบุคลิกให้ Qmon ของเรา</p>
            <h2 className="text-lg font-bold leading-relaxed text-gold-hi">
              {formatPersonalityPrompt(question, getSublineBaseName(context.spritePrefix, context.subline))}
            </h2>
            <div className="flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={() => submit("A", context)}
                className="rounded-2xl border border-gold-dim bg-track px-4 py-4 text-left text-base font-medium text-text transition hover:border-gold active:scale-95"
              >
                {question.choiceA}
              </button>
              <button
                type="button"
                onClick={() => submit("B", context)}
                className="rounded-2xl border border-gold-dim bg-track px-4 py-4 text-left text-base font-medium text-text transition hover:border-gold active:scale-95"
              >
                {question.choiceB}
              </button>
            </div>
          </>
        )}

        {phase === "submitting" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <p className="text-lg font-bold text-gold-hi">กำลังบันทึกบุคลิก...</p>
          </div>
        )}

        {phase === "reveal" && reveal && (
          <>
            <p className="text-sm text-text3">ร่างสมบูรณ์ของเรา!</p>
            <h2 className="text-xl font-bold text-gold-hi">{reveal.fullName}</h2>
            <p className="text-sm font-medium text-amber">
              บุคลิก: {PERSONALITY_LABEL[reveal.personality]} {reveal.personality === "A" ? "🔥" : "🌙"}
            </p>
            <Image
              src={reveal.imagePath}
              alt={reveal.fullName}
              width={160}
              height={160}
              className="animate-evolve-pop"
            />
            <StatRadar stats={reveal.stats} />
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
            >
              ไปเลี้ยง Qmon ต่อ
            </button>
          </>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-lg font-bold text-red">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-text2">{errorMessage}</p>
            <div className="flex w-full flex-col gap-2">
              {lastChoice && context && (
                <button
                  type="button"
                  onClick={() => submit(lastChoice, context)}
                  className="w-full rounded-2xl border border-gold bg-amber py-3 text-base font-bold text-track transition active:scale-95"
                >
                  ลองอีกครั้ง
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-2xl border-2 border-border py-3 text-base font-bold text-text2 transition active:scale-95"
              >
                ปิดไว้ก่อน
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
