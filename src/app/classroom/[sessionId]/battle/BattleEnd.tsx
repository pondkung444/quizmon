"use client";

import Link from "next/link";
import { endedReasonText, outcomeHeadline } from "@/lib/teamBattle/central";
import { STUDENT_TEXT } from "@/lib/teamBattle/student";
import type { CentralBattleView } from "@/lib/teamBattle/types";
import styles from "./battle.module.css";

// จบเกม — ชื่นชมทั้งสองทีม ไม่มีคำว่าแพ้; abandoned (ครูยกเลิก/ห้องจบ) = "เกมนี้ถูกปิดแล้ว"
export default function BattleEnd({ view, backHref }: { view: CentralBattleView; backHref: string }) {
  const b = view.battle;
  const abandoned = b.status === "abandoned";
  const reason = abandoned ? null : endedReasonText(b.ended_reason);
  return (
    <section
      className={`rounded-3xl border border-gold-dim bg-card p-8 text-center ${styles.sentIn}`}
      data-testid="battle-end"
    >
      <p className="text-2xl font-bold text-gold-hi">{outcomeHeadline(b.outcome, abandoned)}</p>
      {reason && <p className="mt-2 text-sm text-text2">{reason}</p>}
      <p className="mt-4 text-sm text-text3">ขอบคุณทุกคนที่ร่วมสนุกกันนะ</p>
      <Link
        href={backHref}
        className="mt-6 inline-flex min-h-14 items-center justify-center rounded-2xl border border-gold bg-amber px-8 text-lg font-bold text-on-amber transition active:scale-95"
      >
        {STUDENT_TEXT.backToRoom}
      </Link>
    </section>
  );
}
