"use client";

import { useState } from "react";
import { fitMove, questionLimit, type CardId, type ChapterBattle } from "@/lib/raid/cards/engine";
import { MOVES } from "./moves";
import styles from "./arena.module.css";

const KIND = { atk: styles.kAtk, sup: styles.kSup, def: styles.kDef };

export default function MovePanel({ hand, battle, petName, busy, onPick }: {
  hand: CardId[];
  battle: ChapterBattle;
  petName: string;
  busy: boolean;
  onPick: (card: CardId) => void;
}) {
  const [picked, setPicked] = useState<CardId | null>(null);
  const fit = fitMove(battle);
  return <>
    <div className={styles.pHead}><h2>ให้{petName}ใช้ท่าไหน?</h2><span>ข้อ {battle.turn} จาก {questionLimit(battle)}</span></div>
    {battle.momentum > 0 && <p className={styles.momentum}>เปิดจุดอ่อนไว้แล้ว ข้อนี้ตีแรงขึ้นมาก</p>}
    <div className={`${styles.moves} ${styles.enter}`}>
      {hand.map((id) => {
        const move = MOVES[id];
        if (!move) return null;
        const Icon = move.icon;
        return <button key={id} type="button" data-move={id} disabled={busy}
          className={`${styles.move} ${KIND[move.kind]} ${id === fit ? styles.fitOn : ""} ${picked === id ? styles.movePicked : ""}`}
          onClick={() => { setPicked(id); onPick(id); }}>
          {id === fit && <span className={styles.fit}>เหมาะตอนนี้</span>}
          <span className={styles.mi}><Icon size={26} /></span>
          <span className={styles.grow}><span className={styles.n}>{move.name}</span><span className={styles.d}>{move.description}</span></span>
        </button>;
      })}
    </div>
    <p className={styles.hint}>เลือกท่าแล้วตอบโจทย์ 1 ข้อ · ตอบถูกใช้ท่าเต็มแรง ตอบผิดยังตีเบาๆ ได้</p>
  </>;
}
