"use client";

import Image from "next/image";
import { fitMoveFor, questionLimit, type ChapterBattle, type TurnLog } from "@/lib/raid/cards/engine";
import type { RaidCardFeedback } from "@/lib/raid/cards/server";
import { ANSWER_LETTERS } from "./AnswerSheet";
import useSheetFit from "./useSheetFit";
import styles from "./arena.module.css";

function petLine(log: TurnLog, battle: ChapterBattle, correct: boolean) {
  if (battle.outcome && battle.hp === 0) return "เราหมดแรงก่อน… พักแล้วมาใหม่นะ";
  if (!correct) return "พลาดไปนิด แต่เรายังตีได้นะ";
  if (log.card === fitMoveFor(log.intent, log.turn, questionLimit(battle))) return "อ่านท่าบอสขาดเลย! ลุยต่อกัน";
  if (log.interrupted) return "หยุดท่าชาร์จได้ทัน!";
  return "เห็นทางแล้ว ตีเต็มแรงเลย!";
}

export default function ResultSheet({ feedback, log, battle, petName, petImage, busy, onFit, onNext }: {
  feedback: RaidCardFeedback;
  log: TurnLog;
  battle: ChapterBattle;
  petName: string;
  petImage: string;
  busy: boolean;
  onFit: (height: number | null) => void;
  onNext: () => void;
}) {
  const ref = useSheetFit(onFit);
  const { correct, correctIndex, explanation, question } = feedback;
  return <div ref={ref} className={`${styles.sheet} ${correct ? styles.ok : styles.miss}`} role="status">
    <div className={styles.resSay}>
      <Image src={petImage} alt={petName} width={52} height={52} />
      <div className={styles.bubble}>{petLine(log, battle, correct)}</div>
    </div>
    <div className={styles.resH}>
      <h3>{correct ? "ถูกแล้ว!" : "ยังไม่ใช่"}</h3>
      <div className={styles.effect}>
        <span className={styles.eDmg}>บอส −{log.dealt}</span>
        {log.healed > 0 && <span className={styles.eHeal}>เรา +{log.healed}</span>}
        {log.taken > 0 && <span className={styles.eTook}>เราโดน −{log.taken}</span>}
      </div>
    </div>
    {!correct && <p className={styles.right}>คำตอบคือ {ANSWER_LETTERS[correctIndex] ?? correctIndex + 1}. {question.choices[correctIndex]}</p>}
    <div className={styles.why}><b>วิธีคิด</b>{explanation || "จำคำตอบนี้ไว้ แล้วลองใช้หลักเดียวกันกับข้อถัดไป"}</div>
    <button type="button" className={styles.cta} disabled={busy} onClick={onNext}>{battle.outcome ? "ดูผลการท้าทาย" : "ข้อต่อไป"}</button>
  </div>;
}
