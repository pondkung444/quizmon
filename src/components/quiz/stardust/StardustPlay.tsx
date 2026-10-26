"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import {
  buildStarStates,
  CHOICE_LETTERS,
  countLit,
  roundStreak,
  eggCracks,
  EGG_HATCH_ANSWERS,
  pickQmonLine,
  STARDUST_TEXT,
} from "@/lib/stardust";
import StarStrip from "@/components/quiz/stardust/StarStrip";
import StardustQuestion from "@/components/quiz/stardust/StardustQuestion";
import AnswerSheet, { type AnswerSheetContent } from "@/components/quiz/stardust/AnswerSheet";
import EggIntro from "@/components/quiz/stardust/EggIntro";
import { ElementGradient, STAR_PATH } from "@/components/quiz/stardust/StarShape";

export type StardustQuestionData = {
  id: number;
  question_text: string;
  category: string;
  image_url: string | null;
  choices: string[];
};

export type StardustResult = { correct: boolean; correctIndex: number; explanation: string | null; expEarned: number };

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const FLY_MS = 560;

// หน้าตอบคำถาม (phase playing) แบบ "ตามหาประกายดาว" — ตัวแสดงผลล้วน state ทั้งหมดเป็นของ QuizClient
// (หรือ StardustPreview) · animation ไม่หน่วง state: ผลตอบ/ข้อถัดไปอัปเดตทันที ดาวที่กำลังลอยแค่ "รอแสดง" บนแถบ
export default function StardustPlay({
  isEgg,
  img,
  cracksBefore,
  question,
  index,
  total,
  priorCount,
  results,
  isMission,
  badges,
  selectedChoice,
  result,
  isLast,
  choicesDisabled,
  nextDisabled,
  saving,
  sheetFooter,
  overlay,
  showIntro,
  onIntroDone,
  onSelect,
  onNext,
  onExit,
}: {
  isEgg: boolean;
  img: string | null;
  cracksBefore: number;
  question: StardustQuestionData;
  index: number;
  total: number;
  priorCount: number;
  results: boolean[];
  isMission: boolean;
  badges?: ReactNode;
  selectedChoice: number | null;
  result: StardustResult | null;
  isLast: boolean;
  choicesDisabled: boolean;
  nextDisabled: boolean;
  saving: boolean;
  sheetFooter?: ReactNode;
  overlay?: ReactNode;
  showIntro: boolean;
  onIntroDone: () => void;
  onSelect: (choiceIndex: number) => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const gradientId = `sd-grad-${useId().replace(/:/g, "")}`;
  const [reduceMotion] = useState(() => typeof window !== "undefined" && window.matchMedia(REDUCE_QUERY).matches);
  // ข้อที่ดาวลงแถบแล้ว (index ของรอบ) — ตอบถูกแล้วดาวยังลอยอยู่ = ยังไม่นับว่าลง
  const [landedFor, setLandedFor] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<AnswerSheetContent | null>(null);
  const [sheetH, setSheetH] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const choiceRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const nextBtnFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const starIndex = priorCount + index;
  const flying = !!result?.correct && landedFor !== index && !reduceMotion;
  const shownResults: (boolean | undefined)[] = flying ? results.slice(0, index) : results;
  const { stars, links } = buildStarStates(shownResults, total, !result || flying ? starIndex : -1, priorCount);
  const correctSoFar = countLit(results);
  const cracks = eggCracks(cracksBefore, correctSoFar);
  const shownCracks = eggCracks(cracksBefore, countLit(shownResults));
  const travelerAt = result && !flying ? starIndex : Math.max(0, starIndex - 1);
  const popIndex = result && !flying && landedFor === index ? starIndex : null;
  const questionNo = Math.min(starIndex + 1, total);

  // ดาวลอยโค้งจากปุ่มที่กดไปยังดาวบนแถบ — จบแล้วค่อยให้ดาวเด้ง/เส้นลาก/น้องกระโดด
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    let anim: Animation | null = null;
    let el: HTMLSpanElement | null = null;
    const land = () => {
      if (!cancelled) setLandedFor(index);
    };
    const btn = selectedChoice !== null ? choiceRefs.current[selectedChoice] : null;
    const node = rootRef.current?.querySelector<HTMLElement>(`[data-star-index="${starIndex}"]`);
    const fx = fxRef.current;
    if (!result.correct || reduceMotion || !btn || !node || !fx || typeof btn.animate !== "function") {
      const t = setTimeout(land, 0);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    const a = btn.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    const x0 = a.left + 30;
    const y0 = a.top + a.height / 2;
    const x1 = b.left + b.width / 2;
    const y1 = b.top + b.height / 2;
    const mx = (x0 + x1) / 2 + 40;
    const my = Math.min(y0, y1) - 40;
    el = document.createElement("span");
    el.className = "sd-fly";
    el.innerHTML = `<svg viewBox="-12 -12 24 24"><path d="${STAR_PATH}" fill="url(#${gradientId})"/></svg>`;
    fx.appendChild(el);
    anim = el.animate(
      [
        { transform: `translate(${x0}px,${y0}px) scale(.6) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${x0}px,${y0 - 14}px) scale(1.25) rotate(40deg)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${mx}px,${my}px) scale(1) rotate(120deg)`, offset: 0.6 },
        { transform: `translate(${x1}px,${y1}px) scale(.7) rotate(180deg)`, opacity: 1 },
      ],
      { duration: FLY_MS, easing: "cubic-bezier(.3,.6,.3,1)" }
    );
    anim.onfinish = land;
    // กันค้าง: แท็บพื้นหลัง/เบราว์เซอร์ที่พัก animation จะไม่ยิง onfinish — ลงเองหลังเวลาบินครบ
    const fallback = setTimeout(land, FLY_MS + 120);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      anim?.cancel();
      el?.remove();
    };
    // ผูกกับ "ผลของข้อนี้" เท่านั้น — เปลี่ยนข้อ/ตอบใหม่ = เริ่มใหม่ (กดรัวไม่ซ้อน: cleanup ยกเลิกตัวเก่า)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, index]);

  // ความสูงแผ่นผล → เว้นที่ล่างของเนื้อหา (มือถือตั้ง) ไม่ให้แผ่นบังตัวเลือก/คำอธิบาย
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const ro = new ResizeObserver(() => setSheetH(sheet.offsetHeight));
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [result]);

  // focus ปุ่มไปต่อหลังแผ่นขึ้น (คีย์บอร์ด/โปรแกรมอ่านจอ) — preventScroll กันจอกระโดด
  useEffect(() => {
    if (!result) return;
    nextBtnFocusTimer.current = setTimeout(
      () => sheetRef.current?.querySelector<HTMLButtonElement>(".sd-btn")?.focus({ preventScroll: true }),
      reduceMotion ? 0 : 340
    );
    return () => {
      if (nextBtnFocusTimer.current) clearTimeout(nextBtnFocusTimer.current);
    };
  }, [result, reduceMotion]);

  const content: AnswerSheetContent | null = result
    ? {
        correct: result.correct,
        line: pickQmonLine({
          isEgg,
          correct: result.correct,
          streak: roundStreak(results),
          roundAllCorrect: isLast && results.length === index + 1 && results.every(Boolean),
          cracksLeft: EGG_HATCH_ANSWERS - cracks,
          index,
        }),
        expEarned: result.expEarned,
        answerText: result.correct
          ? null
          : STARDUST_TEXT.answerIs(CHOICE_LETTERS[result.correctIndex] ?? `${result.correctIndex + 1}`, question.choices[result.correctIndex]),
        explanation: result.explanation,
        isLast,
      }
    : null;

  function handleNext() {
    if (content && !isLast && !reduceMotion) setLeaving(content);
    onNext();
  }

  return (
    <div
      ref={rootRef}
      className={`sd-play-root${result ? " has-sheet" : ""}`}
      style={sheetH ? ({ "--sd-sheet-h": `${sheetH}px` } as CSSProperties) : undefined}
    >
      <ElementGradient id={gradientId} />
      {overlay}
      <StarStrip
        stars={stars}
        links={links}
        travelerAt={travelerAt}
        popIndex={reduceMotion ? null : popIndex}
        isEgg={isEgg}
        img={img}
        cracks={shownCracks}
        gradientId={gradientId}
        ariaLabel={
          isEgg
            ? STARDUST_TEXT.stripLabelEgg(cracks, questionNo, total)
            : priorCount > 0
              ? STARDUST_TEXT.stripLabelPrior(questionNo, total, correctSoFar)
              : STARDUST_TEXT.stripLabel(correctSoFar, questionNo, total)
        }
        onExit={onExit}
      />
      <main className="sd-play">
        <section className="sd-qcol">
          <StardustQuestion
            meta={STARDUST_TEXT.meta(isMission, questionNo, total)}
            category={question.category}
            badges={badges}
            text={question.question_text}
            imageUrl={question.image_url}
            questionKey={question.id}
          />
        </section>
        <section className="sd-acol">
          <ol key={question.id} className="sd-choices sd-enter-2">
            {question.choices.map((text, i) => {
              const isOk = !!result && i === result.correctIndex;
              const isMiss = !!result && !result.correct && i === selectedChoice;
              const letter = CHOICE_LETTERS[i] ?? `${i + 1}`;
              const cls = isOk ? "is-ok" : isMiss ? "is-miss" : result ? "is-dim" : "";
              return (
                <li key={i}>
                  <button
                    ref={(el) => {
                      choiceRefs.current[i] = el;
                    }}
                    type="button"
                    data-testid="choice-button"
                    className={`sd-choice ${cls}`}
                    disabled={choicesDisabled}
                    onClick={() => onSelect(i)}
                    aria-label={
                      isOk
                        ? `${letter} ${text} · ${STARDUST_TEXT.choiceOk}`
                        : isMiss
                          ? `${letter} ${text} · ${STARDUST_TEXT.choiceMiss}`
                          : undefined
                    }
                  >
                    <span className="sd-ltr">{letter}</span>
                    <span className="sd-tx">{text}</span>
                    {isOk && <Check className="sd-mk" strokeWidth={3} aria-hidden />}
                    {isMiss && <X className="sd-mk" strokeWidth={3} aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ol>
          {content && (
            <AnswerSheet
              key={`s${question.id}`}
              ref={sheetRef}
              content={content}
              isEgg={isEgg}
              img={img}
              gradientId={gradientId}
              onNext={handleNext}
              nextDisabled={nextDisabled}
              saving={saving}
              footer={sheetFooter}
            />
          )}
          {leaving && (
            <AnswerSheet
              key="leaving"
              content={leaving}
              isEgg={isEgg}
              img={img}
              gradientId={gradientId}
              onNext={() => {}}
              leaving
              onLeft={() => setLeaving(null)}
            />
          )}
        </section>
      </main>
      <div ref={fxRef} className="sd-fx" aria-hidden />
      {showIntro && <EggIntro img={img} gradientId={gradientId} onDone={onIntroDone} />}
    </div>
  );
}
