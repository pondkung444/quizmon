"use client";

import { useRef, useState } from "react";
import QuizQuestionImage from "@/components/quiz/QuizQuestionImage";
import type { RaidCardQuestion, RaidCardFeedback } from "@/lib/raid/cards/server";
import { CARDS, QUICK_CARDS } from "@/lib/raid/cards/engine";
import styles from "./card-battle.module.css";

const ANSWER_LABELS = ["ก", "ข", "ค", "ง"];

export default function RaidLearningPanel({ question, feedback, busy, shortRound = false, onAnswer, onContinue }: {
  question: RaidCardQuestion;
  feedback?: RaidCardFeedback | null;
  busy: boolean;
  shortRound?: boolean;
  onAnswer: (index: number) => void;
  onContinue: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const answerLock = useRef(false);
  const card = shortRound ? QUICK_CARDS[question.cardId] ?? CARDS[question.cardId] : CARDS[question.cardId];

  async function submit(index: number) {
    if (busy || feedback || answerLock.current) return;
    answerLock.current = true;
    setSelected(index);
    try { await onAnswer(index); }
    finally { answerLock.current = false; }
  }

  return <section className={`${styles.learning} ${feedback ? styles.feedbackPanel : ""}`} aria-label={feedback ? "ผลคำตอบและเฉลย" : "คำถามเพื่อใช้การ์ด"}>
    <div className={feedback ? styles.feedbackBody : styles.questionScroll}>
      <div className={styles.learningHeader}>
        <span className={styles.eyebrow}>{question.category} · {card.name}</span>
        <h2>{feedback ? (feedback.correct ? "ตอบถูก — มอนโจมตีเต็มพลัง!" : "รอบนี้ยังไม่ถูก — มอนยังช่วยสู้ต่อ") : "ตอบให้ถูกเพื่อเพิ่มพลังท่านี้"}</h2>
        <p>{feedback ? "ดูคำตอบกับเหตุผล แล้วกลับไปชมผลของท่านี้" : "เลือกคำตอบหนึ่งข้อ ระบบจะบันทึกทันที"}</p>
      </div>

      <div className={styles.questionCard}>
        <p className={styles.questionText}>{question.text}</p>
        {question.imageUrl && <QuizQuestionImage key={question.revision} src={question.imageUrl} />}
      </div>

      <div className={styles.answers} aria-label="ตัวเลือกคำตอบ">
        {question.choices.map((choice, index) => {
          const isSelected = (feedback?.selectedIndex ?? selected) === index;
          const isCorrect = feedback?.correctIndex === index;
          const isWrongSelected = Boolean(feedback && isSelected && !isCorrect);
          const stateClass = isCorrect ? styles.correctAnswer : isWrongSelected ? styles.wrongAnswer : isSelected ? styles.selectedAnswer : "";
          const stateLabel = isCorrect ? "คำตอบที่ถูก" : isWrongSelected ? "คำตอบของเรา" : null;
          return <button key={index} type="button" data-testid="answer-card" disabled={busy || Boolean(feedback)} aria-pressed={isSelected} onClick={() => void submit(index)} className={stateClass}>
            <span className={styles.answerLetter}>{ANSWER_LABELS[index] ?? index + 1}</span>
            <span className={styles.answerText}>{choice}</span>
            {stateLabel && <strong className={styles.answerState}>{stateLabel}</strong>}
          </button>;
        })}
      </div>

      {feedback && <div className={styles.feedbackSummary} role="status">
        {!feedback.correct && <p className={styles.selectedSolution}><strong>คำตอบของเรา:</strong> {question.choices[feedback.selectedIndex]}</p>}
        <p className={styles.correctSolution}><strong>คำตอบที่ถูก:</strong> {question.choices[feedback.correctIndex]}</p>
        <div className={styles.explanation}>
          <strong>เหตุผล</strong>
          <p>{feedback.explanation || "จำคำตอบนี้ไว้ แล้วลองใช้หลักเดียวกันกับข้อถัดไป"}</p>
        </div>
      </div>}
    </div>

    <div className={feedback ? styles.continueBar : styles.answerDock}>
      {feedback
        ? <button type="button" className={styles.primary} onClick={onContinue}>ดูผลการโจมตี →</button>
        : <p className={styles.finePrint} role="status">{busy ? "กำลังตรวจและบันทึกคำตอบ…" : "ตอบได้ครั้งเดียวในแต่ละท่า"}</p>}
    </div>
  </section>;
}
