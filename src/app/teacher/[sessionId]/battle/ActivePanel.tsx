"use client";

import { useEffect, useState } from "react";
import { PVP_EFFECTS } from "@/lib/pvp/effects";
import type { ClockEstimator } from "@/lib/teamBattle/useServerClock";
import type { BattleState, TeamId } from "@/lib/teamBattle/types";

// แผงสถานะชั่วคราวระหว่างเล่น (จะถูกแทนที่ด้วยจอกลางเต็มใน PR 4.3)
// ไม่แสดงชื่อ/ผู้ใช้ใดๆ — มีแต่ตัวเลขรวมของทีม

const TEAM_NAME: Record<TeamId, string> = { a: "ทีม A", b: "ทีม B" };
const TEAM_TEXT: Record<TeamId, string> = { a: "text-indigo-hi", b: "text-amber" };
const TEAM_BAR: Record<TeamId, string> = { a: "bg-indigo", b: "bg-amber" };

function fmt(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ActivePanel({
  state,
  clock,
  onEnd,
  ending,
}: {
  state: BattleState;
  clock: ClockEstimator;
  onEnd: () => void;
  ending: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const b = state.battle;
  const att = b.attacker_team;
  const def: TeamId | null = att ? (att === "a" ? "b" : "a") : null;
  const last = state.last_round;
  const effect = state.round.card?.effect_id ? PVP_EFFECTS[state.round.card.effect_id] : null;

  const phaseText =
    b.phase === "picking" && att
      ? `ผู้บัญชาการ${TEAM_NAME[att]}กำลังเลือกการ์ด`
      : b.phase === "answering" && def
        ? `${TEAM_NAME[def]}กำลังตอบคำถาม`
        : "กำลังเตรียมยกต่อไป";

  return (
    <section className="mt-5 space-y-4" data-testid="active-panel">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["a", "b"] as TeamId[]).map((t) => {
          const hp = (t === "a" ? b.hp_a : b.hp_b) ?? 0;
          const max = Math.max((t === "a" ? b.hp_max_a : b.hp_max_b) ?? 1, 1);
          return (
            <div key={t} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <h3 className={`text-lg font-bold ${TEAM_TEXT[t]}`}>{TEAM_NAME[t]}</h3>
                <span className="text-sm text-text2">
                  {t === "a" ? b.player_count_a : b.player_count_b} คน
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold text-text">
                {hp}
                <span className="text-sm font-normal text-text3"> / {max}</span>
              </p>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-track">
                <div className={`h-full ${TEAM_BAR[t]} transition-all`} style={{ width: `${Math.min(100, (hp / max) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gold-dim bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-gold-hi">ยกที่ {b.current_round}</p>
          <p className="text-2xl font-bold tabular-nums text-text" data-testid="round-countdown">
            {fmt(clock.msUntil(b.round_deadline, now))}
          </p>
        </div>
        <p className="mt-1 text-sm text-text2">{phaseText}</p>
        {b.phase === "answering" && (
          <p className="mt-1 text-sm text-text2">
            ตอบแล้ว {state.round.answered}/{state.round.defenders_total ?? 0} คน
          </p>
        )}
        {state.round.card && (
          <p className="mt-1 text-xs text-text3">
            การ์ด: {state.round.card.chapter}
            {effect ? ` · ${effect.nameTh}` : ""}
          </p>
        )}
        {b.ends_at && (
          <p className="mt-2 text-xs text-text3">เวลาทั้งเกมเหลือ {fmt(clock.msUntil(b.ends_at, now))}</p>
        )}
      </div>

      {last && (
        <div className="rounded-2xl border border-border bg-card p-4" data-testid="last-round">
          <p className="text-sm font-bold text-text">ผลยกล่าสุด (ยกที่ {last.round_no})</p>
          <p className="mt-1 text-sm text-text2">
            {TEAM_NAME[last.attacker_team]} ส่งการ์ด · ตอบถูก {last.correct_count} · ยังไม่ถูก {last.wrong_count} ·
            ไม่ได้ตอบ {last.no_answer_count} จาก {last.defenders_total} คน · ดาเมจ {last.damage}
            {last.timed_out ? " · หมดเวลา" : ""}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        {confirmEnd ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text2">จบเกมตอนนี้? ผลตัดสินตามพลังชีวิตปัจจุบัน</span>
            <button
              type="button"
              onClick={() => setConfirmEnd(false)}
              className="rounded-xl border border-border px-3 py-1.5 text-sm text-text2"
            >
              ไม่ใช่ตอนนี้
            </button>
            <button
              type="button"
              disabled={ending}
              onClick={onEnd}
              className="rounded-xl border border-red bg-red px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {ending ? "กำลังจบ…" : "จบเกม"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="rounded-xl border border-border px-4 py-2 text-sm text-text3 hover:border-red hover:text-red"
          >
            จบเกม
          </button>
        )}
      </div>
    </section>
  );
}
