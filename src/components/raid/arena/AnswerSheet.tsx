"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QuizQuestionImage from "@/components/quiz/QuizQuestionImage";
import type { RaidCardQuestion } from "@/lib/raid/cards/server";
import { MOVES } from "./moves";
import useSheetFit from "./useSheetFit";
import styles from "./arena.module.css";

export const ANSWER_LETTERS = ["ก", "ข", "ค", "ง"];

export default function AnswerSheet({ question, busy, onAnswer, onFit }: {
  question: RaidCardQuestion;
  busy: boolean;
  onAnswer: (index: number) => Promise<boolean>;
  onFit: (height: number | null) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const ref = useSheetFit(onFit, 96);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);
  const checkClipped = useCallback(() => {
    const el = scrollRef.current;
    if (el) setClipped(el.scrollHeight - el.clientHeight - el.scrollTop > 2);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkClipped);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [checkClipped]);
  const move = MOVES[question.cardId];
  const Icon = move?.icon;

  // One tap answers: every choice locks at once and the tapped one stays marked while saving.
  async function tap(index: number) {
    if (picked !== null || busy) return;
    setPicked(index);
    if (!(await onAnswer(index))) setPicked(null);
  }

  return <div ref={ref} className={`${styles.sheet} ${styles.qSheet}`} role="dialog" aria-label={`ตอบโจทย์เพื่อใช้ท่า ${move?.name ?? ""}`}>
    <div className={styles.grab} />
    {/* The question scrolls; the choices stay pinned so all four are always on screen. */}
    <div className={`${styles.qWrap} ${clipped ? styles.clipped : ""}`}>
      <div ref={scrollRef} className={styles.qScroll} onScroll={checkClipped}>
        <div>
          <div className={styles.used}>
            {move && Icon && <span className={styles.chip}><Icon size={16} /> {move.name}</span>}
            <span className={`${styles.chip} ${styles.chipSub}`}>{question.category}</span>
          </div>
          <p className={styles.qText}>{question.text}</p>
          {question.imageUrl && <QuizQuestionImage key={question.revision} src={question.imageUrl} />}
        </div>
      </div>
    </div>
    <div className={styles.answers}>
      {question.choices.map((choice, index) => <button key={index} type="button" data-testid="arena-answer" disabled={picked !== null || busy}
        className={`${styles.ans} ${picked === index ? styles.picked : ""}`} aria-pressed={picked === index} onClick={() => void tap(index)}>
        <span className={styles.letter}>{ANSWER_LETTERS[index] ?? index + 1}</span><span>{choice}</span>
      </button>)}
    </div>
  </div>;
}
