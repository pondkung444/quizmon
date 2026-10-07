"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import LessonCardHeading from "@/components/quiz/LessonCardHeading";
import { PvpEffectBadge } from "@/app/pvp/[matchId]/PvpEffectBadge";
import {
  TEAM_NAME,
  defenderOf,
  effectNote,
  endedReasonText,
  floatingNumbers,
  formatClock,
  hpPercent,
  narrateRound,
  outcomeHeadline,
  phaseHeadline,
  phaseTotalMs,
  roundBadges,
  timeLeftFraction,
} from "@/lib/teamBattle/central";
import type { CentralRoster } from "@/lib/teamBattle/centralRoster";
import type { CentralBattleView, TeamId } from "@/lib/teamBattle/types";
import type { ClockEstimator } from "@/lib/teamBattle/useServerClock";
import QmonRow from "./QmonRow";
import qmon from "./qmon-row.module.css";
import styles from "./battle-central.module.css";
import tv from "./battle-tv.module.css";

// จอกลาง Team Battle (โปรเจกเตอร์) — รับ CentralBattleView เท่านั้น (ไม่มี user_id ใดๆ)
// หลักออกแบบ: ไม่ลงโทษ/ไม่ใช้คำว่าแพ้; โชว์เฉพาะตัวเลขรวมของทีม; ผู้บัญชาการแสดงเป็น "ทีม A/B" ไม่ใส่ชื่อ
// เลย์เอาต์: กล่อง 16:9 letterbox (แพตเทิร์นเดียวกับ /boss-raid/[id]/tv) ไม่เลื่อนแนวตั้ง
// readOnly = โหมด TV (ไม่มีปุ่มจบเกม/เริ่มใหม่/ลิงก์กลับ)

const TEAM_TEXT: Record<TeamId, string> = { a: "text-indigo-hi", b: "text-amber" };
const TEAM_BAR: Record<TeamId, string> = { a: "bg-indigo", b: "bg-amber" };
const TEAM_RING: Record<TeamId, string> = { a: "border-indigo", b: "border-amber" };
const RESULT_SHOW_MS = 5000;
const DAMAGE_SHOW_MS = 2200;

export default function BattleCentral({
  view,
  clock,
  readOnly = false,
  onEnd,
  ending = false,
  onNew,
  backHref,
  tvHref,
  error,
  roster = null,
}: {
  view: CentralBattleView;
  clock: ClockEstimator;
  readOnly?: boolean;
  onEnd?: () => void;
  ending?: boolean;
  onNew?: () => void;
  backHref?: string;
  /** ลิงก์เปิดจอ TV (โหมดอ่านอย่างเดียว) ในแท็บใหม่ — โชว์เฉพาะโหมดคุมเกม */
  tvHref?: string;
  error?: string | null;
  /** แถว Qmon ของสองทีม (ไม่มีชื่อ/id) — ไม่ส่ง/null = ไม่แสดงแถว ส่วนอื่นของจอทำงานเหมือนเดิม */
  roster?: CentralRoster | null;
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
  const floats = hit && last ? floatingNumbers(last) : [];
  const badges = hit && last ? roundBadges(last) : [];

  return (
    <div className={tv.stage} data-testid="battle-central">
      <div className={tv.box}>
      <div className={tv.inner}>
        {/* ---- แถบบน ---- */}
        <header className="flex shrink-0 items-center justify-between gap-[1.2cqw]">
          <div className="flex items-center gap-[1.2cqw]">
            {!readOnly && backHref && (
              <Link
                href={backHref}
                aria-label="กลับห้องเรียน"
                className="rounded-xl border border-border p-[0.6cqw] text-text2 hover:border-gold-dim hover:text-gold-hi"
              >
                <ArrowLeft className="h-[1.8cqw] w-[1.8cqw]" />
              </Link>
            )}
            <div>
              <p className={`${tv.tSm} text-text3`}>Team Battle</p>
              <h1 className={`${tv.tLead} font-bold text-gold-hi`}>
                {finished ? "จบเกมแล้ว" : `ยกที่ ${b.current_round}`}
              </h1>
            </div>
          </div>
          {!finished && b.ends_at && (
            <p className={`${tv.tBody} text-text2`}>
              เวลาทั้งเกมเหลือ{" "}
              <span className="font-bold tabular-nums text-text">{formatClock(clock.msUntil(b.ends_at, now))}</span>
            </p>
          )}
          <div className="flex items-center gap-[0.8cqw]">
            {!readOnly && tvHref && (
              <a
                href={tvHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${tv.tSm} flex items-center gap-[0.5cqw] rounded-xl border border-border px-[1cqw] py-[0.6cqw] text-text2 hover:border-gold-dim hover:text-gold-hi`}
              >
                <ExternalLink className="h-[1.4cqw] w-[1.4cqw]" aria-hidden />
                เปิดจอ TV
              </a>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}
              className="rounded-xl border border-border p-[0.6cqw] text-text2 hover:border-gold-dim hover:text-gold-hi"
            >
              {fullscreen ? (
                <Minimize2 className="h-[1.8cqw] w-[1.8cqw]" />
              ) : (
                <Maximize2 className="h-[1.8cqw] w-[1.8cqw]" />
              )}
            </button>
            {!readOnly &&
              onEnd &&
              !finished &&
              (confirmEnd ? (
                <div className="flex items-center gap-[0.8cqw]">
                  <span className={`${tv.tSm} text-text2`}>จบเกมตอนนี้? ผลตัดสินตามพลังชีวิตปัจจุบัน</span>
                  <button
                    type="button"
                    onClick={() => setConfirmEnd(false)}
                    className={`${tv.tSm} rounded-xl border border-border px-[1cqw] py-[0.6cqw] text-text2`}
                  >
                    ไม่ใช่ตอนนี้
                  </button>
                  <button
                    type="button"
                    disabled={ending}
                    onClick={onEnd}
                    className={`${tv.tSm} rounded-xl border border-red bg-red px-[1cqw] py-[0.6cqw] font-bold text-white disabled:opacity-50`}
                  >
                    {ending ? "กำลังจบ…" : "จบเกม"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmEnd(true)}
                  className={`${tv.tSm} rounded-xl border border-border px-[1cqw] py-[0.6cqw] text-text3 hover:border-red hover:text-red`}
                >
                  จบเกม
                </button>
              ))}
          </div>
        </header>

        {error && <p className={`${tv.tSm} shrink-0 rounded-xl bg-red/10 px-[1.2cqw] py-[0.8cqw] text-red`}>{error}</p>}

        {/* ---- 2 ทีม ---- */}
        <div className="grid shrink-0 grid-cols-2 gap-[1.2cqw]">
          {(["a", "b"] as TeamId[]).map((t) => {
            const hp = (t === "a" ? b.hp_a : b.hp_b) ?? 0;
            const max = (t === "a" ? b.hp_max_a : b.hp_max_b) ?? 1;
            const players = t === "a" ? b.player_count_a : b.player_count_b;
            const role = finished ? null : t === att ? "ส่งการ์ด" : t === def ? "กำลังตอบ" : null;
            const isHit = hit && hitTeam === t && last && last.damage > 0;
            const teamFloats = floats.filter((f) => f.team === t);
            const teamBadges = badges.filter((x) => x.team === t);
            return (
              <section
                key={t}
                className={`relative rounded-3xl border-2 bg-card px-[1.6cqw] py-[1.2cqw] ${
                  role ? TEAM_RING[t] : "border-border"
                } ${role ? styles.pulse : ""} ${isHit ? styles.hit : ""}`}
                data-testid={`central-team-${t}`}
              >
                {teamFloats.map((f, i) => (
                  <span
                    key={f.id}
                    className={`${tv.float} ${f.tone === "heal" ? "text-good" : "text-red"}`}
                    style={{ left: `${30 + (i % 3) * 20}%` }}
                    aria-hidden
                    data-testid="float-number"
                  >
                    {f.text}
                  </span>
                ))}
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className={`${tv.tLead} font-bold ${TEAM_TEXT[t]}`}>{TEAM_NAME[t]}</h2>
                  <span className={`${tv.tBody} text-text2`}>{players ?? 0} คน</span>
                </div>
                {/* บรรทัดสถานะ + เลข HP อยู่ซ้าย; แถว Qmon (ถ้ามี) ใช้พื้นที่ว่างด้านขวาของเลข — ไม่เพิ่มความสูงการ์ด */}
                <div className="flex items-stretch gap-[1.6cqw]">
                  <div className="shrink-0">
                    <div className={`${tv.tBody} flex min-h-[1.5em] items-center gap-[0.8cqw] font-bold text-gold-hi`}>
                      {role}
                      {teamBadges.map((x) => (
                        <span
                          key={x.text}
                          className="rounded-full bg-red/15 px-[0.9cqw] py-[0.1cqw] text-red"
                          data-testid="round-badge"
                        >
                          {x.text}
                        </span>
                      ))}
                    </div>
                    <p className={`${tv.tNum} mt-[0.4cqw] font-bold tabular-nums text-text`}>
                      {hp}
                      <span className={`${tv.tBody} font-normal text-text3`}> / {max}</span>
                    </p>
                  </div>
                  {roster && roster[t].length > 0 && (
                    <div className={qmon.region}>
                      <QmonRow team={t} members={roster[t]} />
                    </div>
                  )}
                </div>
                <div className="mt-[0.8cqw] h-[1.6cqw] overflow-hidden rounded-full bg-track">
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

        <div className={tv.main}>
          {finished ? (
            <FinishedView view={view} onNew={readOnly ? undefined : onNew} />
          ) : (
            /* ---- ช่วงของยกนี้ ---- */
            <section className="flex h-full flex-col rounded-3xl border border-gold-dim bg-card px-[1.6cqw] py-[1.2cqw]">
              <div className="flex shrink-0 items-center justify-between gap-[1.2cqw]">
                <p className={`${tv.tLead} font-bold text-gold-hi`} data-testid="phase-headline">
                  {phaseHeadline(att, b.phase)}
                </p>
                <p className={`${tv.tNum} font-bold tabular-nums text-text`} data-testid="round-countdown">
                  {formatClock(msLeft)}
                </p>
              </div>
              <div className="mt-[0.6cqw] h-[1.1cqw] shrink-0 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full bg-gold"
                  style={{ width: `${frac * 100}%`, transition: "width 0.25s linear" }}
                  aria-hidden
                />
              </div>

              <div className="mt-[1.2cqw] min-h-0 flex-1 overflow-hidden">
                {/* ผลยกล่าสุด (โชว์ 5 วิหลังปิดยก) แทนที่รายละเอียดของยก */}
                {showResult && last ? (
                  <RoundResultCard round={last} />
                ) : (
                  <>
                    {b.phase === "picking" && att && (
                      <div className="flex items-center gap-[0.8cqw]" aria-hidden>
                        {[0, 1, 2, 3, 4].map((i) => (
                          <span key={i} className="h-[6cqw] w-[4.2cqw] rounded-lg border border-gold-dim bg-track" />
                        ))}
                        <p className={`${tv.tBody} ml-[1.2cqw] text-text2`}>
                          ผู้บัญชาการ{TEAM_NAME[att]}กำลังเลือกจากการ์ด 5 ใบ
                        </p>
                      </div>
                    )}

                    {b.phase === "answering" && card && (
                      <div className="grid grid-cols-2 gap-[1.2cqw]">
                        <div className="rounded-2xl border border-border bg-track p-[1.2cqw]">
                          <LessonCardHeading
                            subject={card.subject}
                            chapter={card.chapter}
                            difficulty={card.difficulty}
                            subjectClassName={`${tv.tSm} inline-flex items-center gap-1 rounded-full bg-indigo/15 px-[0.9cqw] py-[0.2cqw] font-bold text-indigo-hi`}
                            chapterClassName={`${tv.tLead} mt-[0.6cqw] font-sarabun font-bold text-text`}
                            trailing={card.effect_id ? <PvpEffectBadge id={card.effect_id} /> : undefined}
                          />
                          {note && <p className={`${tv.tBody} mt-[0.6cqw] text-text2`}>{note}</p>}
                        </div>
                        <AnsweredMeter answered={view.round.answered} total={view.round.defenders_total ?? 0} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function AnsweredMeter({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (answered / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border bg-track p-[1.2cqw]" data-testid="answered-meter">
      <p className={`${tv.tBody} text-text2`}>ส่งคำตอบแล้ว</p>
      <p className={`${tv.tNum} font-bold tabular-nums text-text`}>
        {answered}
        <span className={`${tv.tBody} font-normal text-text3`}> / {total} คน</span>
      </p>
      <div className="mt-[0.8cqw] h-[1.1cqw] overflow-hidden rounded-full bg-card">
        <div className={`h-full bg-good ${styles.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RoundResultCard({ round }: { round: NonNullable<CentralBattleView["last_round"]> }) {
  const n = narrateRound(round);
  // 2 คอลัมน์: ซ้าย = หัวข้อ + แถบสัดส่วน + ตัวเลขรวม; ขวา = บรรทัดผล (สูงสุด ~5 บรรทัด) — พื้นที่สูงจำกัด ต้องไม่ล้นกล่อง
  return (
    <div
      className={`grid h-full grid-cols-2 gap-[1.6cqw] rounded-2xl border border-border bg-track p-[1.2cqw] ${styles.resultIn}`}
      data-testid="round-result"
    >
      <div className="min-w-0">
        <p className={`${tv.tLead} font-bold text-text`}>{n.headline}</p>
        <div className="mt-[0.8cqw] flex h-[1.1cqw] overflow-hidden rounded-full bg-card" aria-hidden>
          <div className="bg-good" style={{ width: `${n.split.correct}%` }} />
          <div className="bg-warn" style={{ width: `${n.split.wrong}%` }} />
          <div className="bg-text3" style={{ width: `${n.split.none}%` }} />
        </div>
        <p className={`${tv.tBody} mt-[0.8cqw] text-text2`}>
          ตอบถูก {round.correct_count} · ยังไม่ถูก {round.wrong_count} · ไม่ได้ตอบ {round.no_answer_count} (จาก{" "}
          {round.defenders_total} คน)
        </p>
      </div>
      <ul className="min-w-0 space-y-[0.3cqw]">
        {n.lines.map((l) => (
          <li key={l} className={`${tv.tMid} font-bold text-gold-hi`}>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinishedView({ view, onNew }: { view: CentralBattleView; onNew?: () => void }) {
  const b = view.battle;
  const reason = endedReasonText(b.ended_reason);
  return (
    <section
      className="flex h-full flex-col items-center justify-center rounded-3xl border border-gold-dim bg-card p-[2cqw] text-center"
      data-testid="finished-panel"
    >
      <p className={`${tv.tHuge} font-bold text-gold-hi`}>{outcomeHeadline(b.outcome, b.status === "abandoned")}</p>
      {reason && <p className={`${tv.tLead} mt-[0.8cqw] text-text2`}>{reason}</p>}
      <p className={`${tv.tBody} mt-[1.2cqw] text-text3`}>ขอบคุณทุกคนที่ร่วมสนุกกันนะ</p>
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          className={`${tv.tLead} mt-[1.6cqw] rounded-2xl border border-gold bg-amber px-[3cqw] py-[1cqw] font-bold text-on-amber transition active:scale-95`}
        >
          เริ่มเกมใหม่
        </button>
      )}
    </section>
  );
}
