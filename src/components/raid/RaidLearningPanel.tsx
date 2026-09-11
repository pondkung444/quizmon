"use client";
import {useRef, useState} from "react";
import QuizQuestionImage from "@/components/quiz/QuizQuestionImage";
import type {RaidCardQuestion,RaidCardFeedback} from "@/lib/raid/cards/server";
import {CARDS,QUICK_CARDS} from "@/lib/raid/cards/engine";
import styles from "./card-battle.module.css";

export default function RaidLearningPanel({question,feedback,busy,shortRound=false,onAnswer,onContinue}:{question:RaidCardQuestion;feedback?:RaidCardFeedback|null;busy:boolean;shortRound?:boolean;onAnswer:(index:number)=>void;onContinue:()=>void}) {
  const [selected,setSelected]=useState<number|null>(null);
  const answerLock = useRef(false);
  async function submit(index:number) {
    if (busy || feedback || answerLock.current) return;
    answerLock.current = true;
    setSelected(index);
    try { await onAnswer(index); }
    finally { answerLock.current = false; }
  }
  return <section className={styles.learning} aria-label={feedback?"เฉลยคำถาม":"คำถามเพื่อใช้การ์ด"}>
    <div className={styles.questionScroll}>
    <span className={styles.eyebrow}>{question.category} · {(shortRound ? QUICK_CARDS[question.cardId] ?? CARDS[question.cardId] : CARDS[question.cardId]).name}</span>
    <h2>{feedback ? feedback.correct ? "ตอบถูก! มอนลงมือเต็มพลัง" : "ยังไม่ถูก มาทบทวนกัน" : "ใช้ความรู้ส่งพลังให้มอน"}</h2>
    <p className={styles.questionText}>{question.text}</p>
    {question.imageUrl && <QuizQuestionImage key={question.revision} src={question.imageUrl}/>}
    </div>
    <div className={styles.answerDock}>
    <div className={styles.answers}>{question.choices.map((choice,index)=><button key={index} data-testid="answer-card" disabled={busy || !!feedback} aria-pressed={selected===index} onClick={()=>void submit(index)} className={feedback?.correctIndex===index ? styles.correctAnswer : selected===index ? styles.selectedAnswer : ""}>
      <span>{["ก","ข","ค","ง"][index] ?? index+1}</span>{choice}{feedback?.correctIndex===index ? " ✓" : ""}
    </button>)}</div>
    {feedback ? <><p className={styles.explanation}>{feedback.explanation || `คำตอบที่ถูกคือ ${question.choices[feedback.correctIndex]}`}</p><button className={styles.primary} onClick={onContinue}>เข้าใจแล้ว ไปต่อ</button></> : <>
      <p className={styles.finePrint} role="status">{busy ? "กำลังตรวจคำตอบ…" : "แตะคำตอบเพื่อลงมือได้เลย"}</p>
    </>}
    </div>
  </section>;
}
