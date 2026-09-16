"use client";

import { useRef, useState } from "react";
import QuizQuestionImage from "@/components/quiz/QuizQuestionImage";
import type { RaidCardQuestion, RaidCardFeedback } from "@/lib/raid/cards/server";
import { CARDS, QUICK_CARDS, type TurnLog } from "@/lib/raid/cards/engine";
import styles from "./card-battle.module.css";

const ANSWER_LABELS = ["ก", "ข", "ค", "ง"];

export default function RaidLearningPanel({ question, feedback, busy, shortRound = false, turnResult, continueLabel = "กลับไปเลือกท่าถัดไป", onAnswer, onContinue }: {
  question: RaidCardQuestion;
  feedback?: RaidCardFeedback | null;
  busy: boolean;
  shortRound?: boolean;
  turnResult?: TurnLog | null;
  continueLabel?: string;
  onAnswer: (index: number) => void | Promise<void>;
  onContinue: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const answerLock = useRef(false);
  const card = shortRound ? QUICK_CARDS[question.cardId] ?? CARDS[question.cardId] : CARDS[question.cardId];

  async function submit(index: number) {
    if (busy || feedback || answerLock.current) return;
    answerLock.current = true;
    try { await onAnswer(index); }
    finally { answerLock.current = false; }
  }

  return <section className={`${styles.learning} ${feedback ? styles.feedbackPanel : ""}`} aria-label={feedback ? "ผลคำตอบและเฉลย" : "คำถามเพื่อใช้การ์ด"}>
    <div className={feedback ? styles.feedbackBody : styles.questionScroll}>
      <div className={styles.learningHeader}>
        <span className={styles.eyebrow}>{question.category}</span>
        <h2>{feedback ? (feedback.correct ? "✓ ตอบถูกแล้ว!" : "รอบนี้ยังไม่ถูก ลองดูวิธีคิดกัน") : `ตอบคำถามเพื่อใช้ท่า “${card.name}”`}</h2>
        <p>{feedback ? "อ่านเฉลยและผลของท่านี้ แล้วไปต่อเมื่อพร้อม" : "เลือกคำตอบ แล้วกดยืนยันเพื่อให้ Qmon ลงมือ"}</p>
        {!feedback && <div className={styles.moveContext}><strong>{card.name}</strong><span>{card.description}</span></div>}
      </div>

      <div className={styles.questionCard}>
        <p className={styles.questionText}>{question.text}</p>
        {question.imageUrl && <QuizQuestionImage key={question.revision} src={question.imageUrl} />}
      </div>

      {!feedback && <div className={styles.answers} aria-label="ตัวเลือกคำตอบ">
        {question.choices.map((choice, index) => {
          const isSelected = selected === index;
          const stateClass = isSelected ? styles.selectedAnswer : "";
          const stateLabel = isSelected ? "เลือกแล้ว" : null;
          return <button key={index} type="button" data-testid="answer-card" disabled={busy} aria-pressed={isSelected} onClick={() => setSelected(index)} className={stateClass}>
            <span className={styles.answerLetter}>{ANSWER_LABELS[index] ?? index + 1}</span>
            <span className={styles.answerText}>{choice}</span>
            {stateLabel && <strong className={styles.answerState}>{stateLabel}</strong>}
          </button>;
        })}
      </div>}

      {feedback && <div className={styles.feedbackSummary} role="status">
        {!feedback.correct && <p className={styles.selectedSolution}><strong>คำตอบของเรา:</strong> {question.choices[feedback.selectedIndex]}</p>}
        <p className={styles.correctSolution}><strong>คำตอบที่ถูก:</strong> {question.choices[feedback.correctIndex]}</p>
        <div className={styles.explanation}>
          <strong>เหตุผล</strong>
          <p>{feedback.explanation || "จำคำตอบนี้ไว้ แล้วลองใช้หลักเดียวกันกับข้อถัดไป"}</p>
        </div>
        {turnResult && <div className={styles.moveResult} aria-label="ผลของท่านี้">
          <strong>{card.name}{turnResult.critical ? " · คริติคอล!" : ""}</strong>
          <div>
            <span>ลดเลือดบอส <b>−{turnResult.dealt}</b></span>
            <span>Qmon เสียเลือด <b>−{turnResult.taken}</b></span>
            {turnResult.healed > 0 && <span>ฟื้นเลือด Qmon <b>+{turnResult.healed}</b></span>}
          </div>
        </div>}
      </div>}
    </div>

    <div className={feedback ? styles.continueBar : styles.answerDock}>
      {feedback
        ? <button type="button" className={styles.primary} onClick={onContinue}>{continueLabel} →</button>
        : <button type="button" className={styles.primary} disabled={busy || selected === null} onClick={() => selected !== null && void submit(selected)}>
          {busy ? "กำลังตรวจและบันทึกคำตอบ…" : selected === null ? "เลือกคำตอบก่อน" : "ยืนยันคำตอบ · ใช้ท่านี้"}
        </button>}
    </div>
  </section>;
}
