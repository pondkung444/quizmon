"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import LessonCardHeading from "@/components/quiz/LessonCardHeading";
import { PvpEffectBadge } from "@/app/pvp/[matchId]/PvpEffectBadge";
import {
  TEAM_NAME,
  defenderOf,
  effectNote,
  endedReasonText,
  formatClock,
  hpPercent,
  narrateRound,
  outcomeHeadline,
  phaseHeadline,
  phaseTotalMs,
  timeLeftFraction,
} from "@/lib/teamBattle/central";
import type { CentralBattleView, TeamId } from "@/lib/teamBattle/types";
import type { ClockEstimator } from "@/lib/teamBattle/useServerClock";
import styles from "./battle-central.module.css";

// จอกลาง Team Battle (โปรเจกเตอร์) — รับ CentralBattleView เท่านั้น (ไม่มี user_id ใดๆ)
// หลักออกแบบ: ไม่ลงโทษ/ไม่ใช้คำว่าแพ้; โชว์เฉพาะตัวเลขรวมของทีม; ผู้บัญชาการแสดงเป็น "ทีม A/B" ไม่ใส่ชื่อ

const TEAM_TEXT: Record<TeamId, string> = { a: "text-indigo-hi", b: "text-amber" };
const TEAM_BAR: Record<TeamId, string> = { a: "bg-indigo", b: "bg-amber" };
const TEAM_RING: Record<TeamId, string> = { a: "border-indigo", b: "border-amber" };
const RESULT_SHOW_MS = 5000;
const DAMAGE_SHOW_MS = 2200;

export default function BattleCentral({
  view,
  clock,
  onEnd,
  ending,
  onNew,
  backHref,
  error,
}: {
  view: CentralBattleView;
  clock: ClockEstimator;
  onEnd: () => void;
  ending: boolean;
  onNew: () => void;
  backHref: string;
  error?: string | null;
}) {
  const b = view.battle;
  const last = view.last_round;
  const [now, setNow] = useState(() => Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // เห็นผลยกใหม่เมื่อ round_no ของ last_round เปลี่ยน (ปรับ state ระหว่าง render — ไม่ใช้ effect)
  const [seenRound, setSeenRound] = useState<number | null>(last?.round_no ?? null);
  const [shownAt, setShownAt] = useState<number | null>(null);
  if ((last?.round_no ?? null) !== seenRound) {
    setSeenRound(last?.round_no ?? null);
    if (last) setShownAt(now);
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  const finished = b.status !== "active";
  const att = b.attacker_team;
  const def = att ? defenderOf(att) : null;
  const card = view.round.card;
  const msLeft = clock.msUntil(b.round_deadline, now);
  const frac = timeLeftFraction(msLeft, phaseTotalMs(b.config, b.phase, card?.effect_id));
  const showResult = !!last && shownAt !== null && now - shownAt < RESULT_SHOW_MS && !finished;
  const hit = !!last && shownAt !== null && now - shownAt < DAMAGE_SHOW_MS;
  const hitTeam = last ? defenderOf(last.attacker_team) : null;
  const note = effectNote(card?.effect_id);

  return (
    <div className={styles.shell} data-testid="battle-central">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-8">
        {/* ---- แถบบน ---- */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              aria-label="กลับห้องเรียน"
              className="rounded-xl border border-border p-2 text-text2 hover:border-gold-dim hover:text-gold-hi"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-xs text-text3">Team Battle</p>
              <h1 className="text-2xl font-bold text-gold-hi">
                {finished ? "จบเกมแล้ว" : `ยกที่ ${b.current_round}`}
              </h1>
            </div>
          </div>
          {!finished && b.ends_at && (
            <p className="text-sm text-text2">
              เวลาทั้งเกมเหลือ{" "}
              <span className="font-bold tabular-nums text-text">{formatClock(clock.msUntil(b.ends_at, now))}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
              className="rounded-xl border border-border p-2 text-text2 hover:border-gold-dim hover:text-gold-hi"
            >
              {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            {!finished &&
              (confirmEnd ? (
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
                  className="rounded-xl border border-border px-3 py-2 text-sm text-text3 hover:border-red hover:text-red"
                >
                  จบเกม
                </button>
              ))}
          </div>
        </header>

        {error && <p className="rounded-xl bg-red/10 px-4 py-3 text-sm text-red">{error}</p>}

        {/* ---- 2 ทีม ---- */}
        <div className="grid gap-4 md:grid-cols-2">
          {(["a", "b"] as TeamId[]).map((t) => {
            const hp = (t === "a" ? b.hp_a : b.hp_b) ?? 0;
            const max = (t === "a" ? b.hp_max_a : b.hp_max_b) ?? 1;
            const players = t === "a" ? b.player_count_a : b.player_count_b;
            const role = finished ? null : t === att ? "ส่งการ์ด" : t === def ? "กำลังตอบ" : null;
            const isHit = hit && hitTeam === t && last && last.damage > 0;
            return (
              <section
                key={t}
                className={`relative rounded-3xl border-2 bg-card p-5 ${role ? TEAM_RING[t] : "border-border"} ${
                  role ? styles.pulse : ""
                } ${isHit ? styles.hit : ""}`}
                data-testid={`central-team-${t}`}
              >
                {isHit && last && (
                  <span className={`${styles.damage} ${TEAM_TEXT[t]}`} aria-hidden>
                    −{last.damage}
                  </span>
                )}
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className={`text-3xl font-bold ${TEAM_TEXT[t]}`}>{TEAM_NAME[t]}</h2>
                  <span className="text-base text-text2">{players ?? 0} คน</span>
                </div>
                {role && <p className="mt-0.5 text-sm font-bold text-gold-hi">{role}</p>}
                <p className="mt-3 text-5xl font-bold tabular-nums text-text">
                  {hp}
                  <span className="text-lg font-normal text-text3"> / {max}</span>
                </p>
                <div className="mt-3 h-5 overflow-hidden rounded-full bg-track">
                  <div
                    className={`h-full ${TEAM_BAR[t]} ${styles.bar}`}
                    style={{ width: `${hpPercent(hp, max)}%` }}
                    role="progressbar"
                    aria-valuenow={hp}
                    aria-valuemin={0}
                    aria-valuemax={max}
                    aria-label={`พลังชีวิต${TEAM_NAME[t]}`}
                  />
                </div>
              </section>
            );
          })}
        </div>

        {finished ? (
          <FinishedView view={view} onNew={onNew} />
        ) : (
          <>
            {/* ---- ช่วงของยกนี้ ---- */}
            <section className="rounded-3xl border border-gold-dim bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xl font-bold text-gold-hi" data-testid="phase-headline">
                  {phaseHeadline(att, b.phase)}
                </p>
                <p className="text-4xl font-bold tabular-nums text-text" data-testid="round-countdown">
                  {formatClock(msLeft)}
                </p>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full bg-gold"
                  style={{ width: `${frac * 100}%`, transition: "width 0.25s linear" }}
                  aria-hidden
                />
              </div>

              {b.phase === "picking" && att && (
                <div className="mt-4 flex items-center gap-2" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="h-16 w-11 rounded-lg border border-gold-dim bg-track" />
                  ))}
                  <p className="ml-3 text-sm text-text3">ผู้บัญชาการ{TEAM_NAME[att]}กำลังเลือกจากการ์ด 5 ใบ</p>
                </div>
              )}

              {b.phase === "answering" && card && (
                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-border bg-track p-4">
                    <LessonCardHeading
                      subject={card.subject}
                      chapter={card.chapter}
                      difficulty={card.difficulty}
                      trailing={card.effect_id ? <PvpEffectBadge id={card.effect_id} /> : undefined}
                    />
                    {note && <p className="mt-2 text-sm text-text2">{note}</p>}
                  </div>
                  <AnsweredMeter answered={view.round.answered} total={view.round.defenders_total ?? 0} />
                </div>
              )}
            </section>

            {/* ---- ผลยกล่าสุด (โชว์ 5 วิหลังปิดยก) ---- */}
            {showResult && last && <RoundResultCard round={last} />}
          </>
        )}
      </div>
    </div>
  );
}

function AnsweredMeter({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (answered / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border bg-track p-4" data-testid="answered-meter">
      <p className="text-sm text-text2">ส่งคำตอบแล้ว</p>
      <p className="mt-1 text-4xl font-bold tabular-nums text-text">
        {answered}
        <span className="text-lg font-normal text-text3"> / {total} คน</span>
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-card">
        <div className={`h-full bg-good ${styles.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RoundResultCard({ round }: { round: NonNullable<CentralBattleView["last_round"]> }) {
  const n = narrateRound(round);
  return (
    <section className={`rounded-3xl border border-border bg-card p-5 ${styles.resultIn}`} data-testid="round-result">
      <p className="text-lg font-bold text-text">{n.headline}</p>
      <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-track" aria-hidden>
        <div className="bg-good" style={{ width: `${n.split.correct}%` }} />
        <div className="bg-warn" style={{ width: `${n.split.wrong}%` }} />
        <div className="bg-text3" style={{ width: `${n.split.none}%` }} />
      </div>
      <p className="mt-2 text-sm text-text2">
        ตอบถูก {round.correct_count} · ยังไม่ถูก {round.wrong_count} · ไม่ได้ตอบ {round.no_answer_count} (จาก{" "}
        {round.defenders_total} คน)
      </p>
      <ul className="mt-3 space-y-1">
        {n.lines.map((l) => (
          <li key={l} className="text-lg font-bold text-gold-hi">
            {l}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinishedView({ view, onNew }: { view: CentralBattleView; onNew: () => void }) {
  const b = view.battle;
  const reason = endedReasonText(b.ended_reason);
  return (
    <section className="rounded-3xl border border-gold-dim bg-card p-8 text-center" data-testid="finished-panel">
      <p className="text-3xl font-bold text-gold-hi">{outcomeHeadline(b.outcome, b.status === "abandoned")}</p>
      {reason && <p className="mt-2 text-base text-text2">{reason}</p>}
      <p className="mt-4 text-sm text-text3">ขอบคุณทุกคนที่ร่วมสนุกกันนะ</p>
      <button
        type="button"
        onClick={onNew}
        className="mt-6 rounded-2xl border border-gold bg-amber px-8 py-3 text-lg font-bold text-on-amber transition active:scale-95"
      >
        เริ่มเกมใหม่
      </button>
    </section>
  );
}
