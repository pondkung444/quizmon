"use client";
import {useState} from "react";
import {QuestionImage} from "@/components/QuizClient";
import type {RaidCardQuestion,RaidCardFeedback} from "@/lib/raid/cards/server";
import {CARDS,QUICK_CARDS} from "@/lib/raid/cards/engine";
import styles from "./card-battle.module.css";

export default function RaidLearningPanel({question,feedback,busy,shortRound=false,onAnswer,onContinue}:{question:RaidCardQuestion;feedback?:RaidCardFeedback|null;busy:boolean;shortRound?:boolean;onAnswer:(index:number)=>void;onContinue:()=>void}) {
  const [selected,setSelected]=useState<number|null>(null);
  return <section className={styles.learning} aria-label={feedback?"เฉลยคำถาม":"คำถามเพื่อใช้การ์ด"}>
    <span className={styles.eyebrow}>{question.category} · {(shortRound ? QUICK_CARDS[question.cardId] ?? CARDS[question.cardId] : CARDS[question.cardId]).name}</span>
    <h2>{feedback ? feedback.correct ? "ตอบถูก! มอนลงมือเต็มพลัง" : "ยังไม่ถูก มาทบทวนกัน" : "ใช้ความรู้ส่งพลังให้มอน"}</h2>
    <p className={styles.questionText}>{question.text}</p>
    {question.imageUrl && <QuestionImage src={question.imageUrl}/>}
    <div className={styles.answers}>{question.choices.map((choice,index)=><button key={index} disabled={busy || !!feedback} aria-pressed={selected===index} onClick={()=>setSelected(index)} className={feedback?.correctIndex===index ? styles.correctAnswer : selected===index ? styles.selectedAnswer : ""}>
      <span>{["ก","ข","ค","ง"][index] ?? index+1}</span>{choice}{feedback?.correctIndex===index ? " ✓" : ""}
    </button>)}</div>
    {feedback ? <><p className={styles.explanation}>{feedback.explanation || `คำตอบที่ถูกคือ ${question.choices[feedback.correctIndex]}`}</p><button className={styles.primary} onClick={onContinue}>เข้าใจแล้ว ไปต่อ</button></> : <>
      <p className={styles.finePrint}>{shortRound ? "ตอบถูกโจมตีเต็มแรงและลุ้นคริติคอล • ตอบผิดมอนยังช่วยตี" : "ตอบถูกใช้พลังเต็มและเช็ก stat • ตอบผิดยังได้แรงประคองตัว แต่ไม่มีผลพิเศษ"}</p>
      <button className={styles.primary} data-testid="answer-card" disabled={busy || selected===null} onClick={()=>selected!==null && onAnswer(selected)}>{busy?"กำลังตรวจคำตอบ...":"ยืนยันคำตอบและลงมือ"}</button>
    </>}
  </section>;
}
