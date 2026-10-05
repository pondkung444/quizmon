"use client";

import { useCallback, useEffect, useState } from "react";
import LessonCardHeading from "@/components/quiz/LessonCardHeading";
import { PvpEffectBadge } from "@/app/pvp/[matchId]/PvpEffectBadge";
import { effectNote, formatClock, phaseTotalMs, timeLeftFraction } from "@/lib/teamBattle/central";
import { explainBattleError } from "@/lib/teamBattle/errors";
import { fetchMyHand, playerRpc } from "@/lib/teamBattle/rpc";
import { HAND_RETRY_MS, STUDENT_TEXT } from "@/lib/teamBattle/student";
import type { BattleConfigPublic, MyHandCard } from "@/lib/teamBattle/types";
import type { ClockEstimator } from "@/lib/teamBattle/useServerClock";
import { useNowTick } from "@/lib/teamBattle/useNowTick";
import styles from "./battle.module.css";

// ผู้บัญชาการเลือกการ์ด 1 ใน 5: แตะเลือก → ปุ่มใหญ่ "ส่งการ์ดนี้" (กันแตะพลาด) → tb_pick_card
// มือการ์ดอ่านผ่าน fetchMyHand (กรองยกปัจจุบัน + ใบที่ยังไม่ลงสนาม); โจทย์ไม่ถูกเปิดเผยให้ผู้บัญชาการ

export default function CommanderPick({
  battleId,
  round,
  deadline,
  config,
  clock,
  refetch,
}: {
  battleId: string;
  round: number;
  deadline: string | null;
  config: BattleConfigPublic;
  clock: ClockEstimator;
  refetch: () => Promise<void>;
}) {
  const [hand, setHand] = useState<MyHandCard[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const now = useNowTick();

  const loadHand = useCallback(
    async (retryOnEmpty: boolean) => {
      try {
        let cards = await fetchMyHand(battleId, round);
        if (cards.length === 0 && retryOnEmpty) {
          await new Promise((r) => setTimeout(r, HAND_RETRY_MS));
          cards = await fetchMyHand(battleId, round);
        }
        setHand(cards);
        setLoadFailed(false);
      } catch {
        setLoadFailed(true);
        setHand((h) => h ?? []);
      }
    },
    [battleId, round]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadHand(true);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadHand]);

  async function send() {
    if (!selected || busy || sent) return;
    setBusy(true);
    setError(null);
    try {
      await playerRpc.pickCard(battleId, selected);
      setSent(true);
      void refetch();
    } catch (e) {
      const x = explainBattleError(e);
      // เลือกไปแล้ว/หมดเวลา = สถานะเปลี่ยนไปแล้ว → refetch เงียบ ไม่ขึ้น error
      if (x.code === "invalid_card" || x.code === "round_closed" || x.kind === "silent") void refetch();
      else setError(x.message);
    } finally {
      setBusy(false);
    }
  }

  const msLeft = clock.msUntil(deadline, now);
  const frac = timeLeftFraction(msLeft, phaseTotalMs(config, "picking", null));

  if (sent) {
    return (
      <section className={`rounded-3xl border border-gold-dim bg-card p-8 text-center ${styles.sentIn}`}>
        <p className="text-3xl font-bold text-gold-hi">{STUDENT_TEXT.commanderSent}</p>
        <p className="mt-2 text-text2">{STUDENT_TEXT.commanderSentHint}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="commander-pick">
      <div className="rounded-2xl border border-gold-dim bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-gold-hi">{STUDENT_TEXT.commanderTitle}</p>
            <p className="text-sm text-text2">{STUDENT_TEXT.commanderHint}</p>
          </div>
          <p className="text-3xl font-bold tabular-nums text-text" data-testid="pick-countdown">
            {formatClock(msLeft)}
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track" aria-hidden>
          <div className="h-full bg-gold" style={{ width: `${frac * 100}%`, transition: "width 0.25s linear" }} />
        </div>
      </div>

      {hand === null && <p className="py-6 text-center text-text3">{STUDENT_TEXT.handLoading}</p>}

      {hand !== null && hand.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <p className="text-text2">{STUDENT_TEXT.handEmpty}</p>
          <button
            type="button"
            onClick={() => void loadHand(false)}
            className="mt-3 min-h-12 rounded-xl border border-gold-dim px-5 text-gold-hi active:scale-95"
          >
            {STUDENT_TEXT.handRetry}
          </button>
          {loadFailed && <p className="mt-2 text-xs text-text3">เชื่อมต่อไม่สำเร็จ ลองอีกครั้งนะ</p>}
        </div>
      )}

      <ul className="space-y-2.5">
        {(hand ?? []).map((c) => {
          const on = selected === c.id;
          const note = effectNote(c.effect_id);
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(c.id)}
                aria-pressed={on}
                data-card={c.id}
                className={`${styles.cardPick} min-h-[88px] w-full rounded-2xl border-2 p-3 text-left ${
                  on ? "border-gold bg-amber/10" : "border-border bg-card"
                }`}
              >
                <LessonCardHeading
                  subject={c.subject}
                  chapter={c.chapter}
                  difficulty={c.difficulty}
                  trailing={c.effect_id ? <PvpEffectBadge id={c.effect_id} /> : undefined}
                />
                {note && <p className="mt-1.5 text-xs text-text2">{note}</p>}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">{error}</p>}

      <button
        type="button"
        disabled={!selected || busy}
        onClick={() => void send()}
        className="sticky bottom-3 min-h-14 w-full rounded-2xl border border-gold bg-amber text-lg font-bold text-on-amber shadow-lg transition active:scale-95 disabled:opacity-40"
      >
        {busy ? "กำลังส่ง…" : STUDENT_TEXT.commanderSend}
      </button>
    </section>
  );
}
