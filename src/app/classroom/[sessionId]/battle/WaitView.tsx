"use client";

import LessonCardHeading from "@/components/quiz/LessonCardHeading";
import { PvpEffectBadge } from "@/app/pvp/[matchId]/PvpEffectBadge";
import { effectNote, formatClock } from "@/lib/teamBattle/central";
import { STUDENT_TEXT } from "@/lib/teamBattle/student";
import type { PlayedCard } from "@/lib/teamBattle/types";
import styles from "./battle.module.css";

// หน้ารอทั้งหมดของผู้เล่น: ทีมโจมตีรอผู้บัญชาการ / ทีมรับรอทีมตรงข้ามเลือกการ์ด /
// ตอบแล้วรอเพื่อน / ทีมโจมตีดูการ์ดที่เล่น (ตัวเลขรวมเท่านั้น ไม่มีชื่อใคร)

export default function WaitView({
  title,
  subtitle,
  msLeft,
  card,
  answered,
  total,
}: {
  title: string;
  subtitle?: string;
  /** ms ที่เหลือของช่วงนี้ (ไม่ส่ง = ไม่โชว์เวลา) */
  msLeft?: number;
  card?: PlayedCard | null;
  answered?: number;
  total?: number;
}) {
  const showMeter = answered !== undefined && total !== undefined;
  const pct = showMeter && total! > 0 ? Math.min(100, (answered! / total!) * 100) : 0;
  const note = card ? effectNote(card.effect_id) : null;

  return (
    <section className={`space-y-3 ${styles.sentIn}`} data-testid="wait-view">
      <div className="rounded-3xl border border-gold-dim bg-card p-6 text-center">
        <p className="text-xl font-bold text-gold-hi">{title}</p>
        {subtitle && <p className="mt-1 text-sm text-text2">{subtitle}</p>}
        {msLeft !== undefined && Number.isFinite(msLeft) && (
          <p className="mt-3 text-4xl font-bold tabular-nums text-text">{formatClock(msLeft)}</p>
        )}
      </div>

      {card && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <LessonCardHeading
            subject={card.subject}
            chapter={card.chapter}
            difficulty={card.difficulty}
            trailing={card.effect_id ? <PvpEffectBadge id={card.effect_id} /> : undefined}
          />
          {note && <p className="mt-2 text-sm text-text2">{note}</p>}
        </div>
      )}

      {showMeter && (
        <div className="rounded-2xl border border-border bg-card p-4" data-testid="answered-count">
          <p className="text-center text-sm text-text2">{STUDENT_TEXT.answeredCount(answered!, total!)}</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-track">
            <div className={`h-full bg-good ${styles.bar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
