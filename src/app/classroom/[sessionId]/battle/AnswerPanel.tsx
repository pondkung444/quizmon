"use client";

import { useEffect, useState } from "react";
import { PvpEffectBadge } from "@/app/pvp/[matchId]/PvpEffectBadge";
import QuizQuestionImage from "@/components/quiz/QuizQuestionImage";
import { effectNote, formatClock, phaseTotalMs, timeLeftFraction } from "@/lib/teamBattle/central";
import { explainBattleError } from "@/lib/teamBattle/errors";
import { fetchMyAnswer, playerRpc, viewerRpc } from "@/lib/teamBattle/rpc";
import { STUDENT_TEXT } from "@/lib/teamBattle/student";
import type { ActiveQuestion, BattleConfigPublic } from "@/lib/teamBattle/types";
import type { ClockEstimator } from "@/lib/teamBattle/useServerClock";
import { useNowTick } from "@/lib/teamBattle/useNowTick";

// ผู้เล่นทีมรับตอบโจทย์ — ผู้เรียกต้องเรียกเฉพาะ role = ผู้เล่นทีมรับ + phase answering (กัน not_a_defender)
// โจทย์มาจาก tb_get_active_question เท่านั้น (ไม่มีเฉลย); ตัวเลือกเรียงตามที่ DB ส่ง ไม่สลับ
// แตะครั้งเดียว = ส่ง + ล็อกทันที; เวลาใช้ deadline ของเซิร์ฟเวอร์เสมอ (haste ลดเวลาแล้ว)

export default function AnswerPanel({
  battleId,
  round,
  config,
  clock,
  refetch,
  onAnswered,
}: {
  battleId: string;
  round: number;
  config: BattleConfigPublic;
  clock: ClockEstimator;
  refetch: () => Promise<void>;
  /** ตอบแล้ว (ส่งสำเร็จ / already_answered / พบคำตอบเดิมตอนเข้าหน้ากลางยก) */
  onAnswered: (round: number) => void;
}) {
  const [q, setQ] = useState<ActiveQuestion | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const now = useNowTick();

  // เข้าหน้ากลางยก (รีเฟรช): เช็กคำตอบของตัวเองก่อน แล้วค่อยโหลดโจทย์
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mine = await fetchMyAnswer(battleId, round);
        if (cancelled) return;
        if (mine) {
          onAnswered(round);
          return;
        }
        const t0 = Date.now();
        const question = await playerRpc.getActiveQuestion(battleId);
        const t1 = Date.now();
        if (cancelled) return;
        if (!question) {
          void refetch();
          return;
        }
        clock.recordSample({ t0, t1, serverNow: question.server_now });
        setQ(question);
      } catch (e) {
        if (cancelled) return;
        const x = explainBattleError(e);
        if (x.kind === "silent" || x.kind === "soft") void refetch();
        else setLoadError(x.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [battleId, round, clock, refetch, onAnswered]);

  async function choose(i: number) {
    if (locked || !q) return;
    setLocked(true);
    setPicked(i);
    setNotice(null);
    try {
      await playerRpc.submitAnswer(battleId, i);
      onAnswered(round);
      void refetch();
    } catch (e) {
      const x = explainBattleError(e);
      if (x.code === "already_answered") {
        setNotice(STUDENT_TEXT.answeredAlready);
        onAnswered(round);
        void refetch();
      } else if (x.code === "round_closed" || x.code === "not_answering") {
        setNotice(STUDENT_TEXT.timeUp);
        void viewerRpc.tick(battleId).catch(() => {});
        void refetch();
      } else {
        // ข้อผิดพลาดอื่น: ปลดล็อกให้ลองใหม่ได้
        setNotice(x.message);
        setLocked(false);
        setPicked(null);
      }
    }
  }

  if (loadError) return <p className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">{loadError}</p>;
  if (!q) return <p className="py-10 text-center text-text3">{STUDENT_TEXT.answerLoading}</p>;

  const msLeft = clock.msUntil(q.round_deadline, now);
  const frac = timeLeftFraction(msLeft, phaseTotalMs(config, "answering", q.effect_id));
  const note = effectNote(q.effect_id);

  return (
    <section className="space-y-3" data-testid="answer-panel">
      <div className="rounded-2xl border border-gold-dim bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gold-hi">ยกที่ {q.round_no}</span>
            {q.effect_id && <PvpEffectBadge id={q.effect_id} />}
          </div>
          <p className="text-3xl font-bold tabular-nums text-text" data-testid="answer-countdown">
            {formatClock(msLeft)}
          </p>
        </div>
        {note && <p className="mt-1 text-xs text-text2">{note}</p>}
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track" aria-hidden>
          <div className="h-full bg-gold" style={{ width: `${frac * 100}%`, transition: "width 0.25s linear" }} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="whitespace-pre-wrap text-lg font-bold leading-relaxed text-text">{q.question_text}</p>
        {q.image_url && (
          <div className="mt-3">
            <QuizQuestionImage key={q.question_id} src={q.image_url} />
          </div>
        )}
      </div>

      <ul className="space-y-2.5">
        {q.choices.map((c, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={locked}
              onClick={() => void choose(i)}
              data-choice={i}
              className={`min-h-14 w-full rounded-2xl border-2 px-4 py-3 text-left text-base transition active:scale-[0.98] ${
                picked === i ? "border-gold bg-amber/15 font-bold text-gold-hi" : "border-border bg-card text-text"
              } disabled:opacity-70`}
            >
              {c}
            </button>
          </li>
        ))}
      </ul>

      {notice && <p className="rounded-xl bg-warn/10 px-4 py-3 text-center text-sm text-warn">{notice}</p>}
    </section>
  );
}
