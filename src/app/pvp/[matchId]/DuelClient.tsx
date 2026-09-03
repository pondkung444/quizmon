"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PvpMatchView } from "@/lib/pvp";
import { pvpEstimatedDamage } from "@/lib/pvp/combat";
import { usePvpMatch } from "@/lib/pvp/usePvpMatch";
import { assignPvpCard, drawPvpCards, submitPvpCard, type PvpSubmitResult } from "../actions";

function HpBar({ label, hp, hpMax, mine }: { label: string; hp: number; hpMax: number; mine: boolean }) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, hpMax)) * 100));
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between text-xs text-text3">
        <span>{label}</span>
        <span>
          {Math.max(0, hp)} / {hpMax}
        </span>
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-track">
        <div
          className={`h-full transition-all ${mine ? "bg-green-400" : "bg-red"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DuelClient({ view }: { view: PvpMatchView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PvpSubmitResult | null>(null);
  const submittedRef = useRef(false);

  // ระหว่างโชว์ผลตอบ (2.2 วิ) อย่าให้ realtime กระชากหน้าให้ remount ก่อนผู้เล่นเห็นผล —
  // ตัว setTimeout หลัง submit เป็นคนสั่ง refresh จริงเอง
  const holdRef = useRef(false);
  const refresh = useCallback(() => {
    if (holdRef.current) return;
    router.refresh();
  }, [router]);
  usePvpMatch(view.matchId, refresh);

  // attacker: มือว่าง (edge case) -> จั่วเอง
  useEffect(() => {
    if (view.status !== "active" || !view.isAttacker || view.hand.length > 0) return;
    void drawPvpCards(view.matchId).then((r) => {
      if (r.ok) refresh();
      else setError(r.message);
    });
  }, [view.status, view.isAttacker, view.hand.length, view.matchId, refresh]);

  // ---- ผู้ตอบ: timer (display เท่านั้น — หมดเวลา = auto-submit -1) ----
  // DuelClient remount ทุกครั้งที่เฟส/ยกเปลี่ยน (key ในหน้า page.tsx) -> init state พอ ไม่ต้อง reset ใน effect
  const [remain, setRemain] = useState(view.timerSeconds);
  useEffect(() => {
    if (!view.isDefender || result) return;
    const t = window.setInterval(() => {
      setRemain((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [view.isDefender, result]);

  const doSubmit = useCallback(
    async (answerIndex: number) => {
      if (submittedRef.current || !view.activeCard || !view.activeQuestion) return;
      submittedRef.current = true;
      setBusy(true);
      setError(null);
      const r = await submitPvpCard(
        view.matchId,
        view.activeCard.id,
        view.activeQuestion.questionId,
        answerIndex
      );
      setBusy(false);
      if (!r.ok) {
        submittedRef.current = false;
        setError(r.message);
        return;
      }
      setResult(r.data);
      holdRef.current = true;
      window.setTimeout(() => {
        holdRef.current = false;
        router.refresh();
      }, 2200);
    },
    [view.matchId, view.activeCard, view.activeQuestion, router]
  );

  useEffect(() => {
    if (view.isDefender && remain === 0 && !submittedRef.current && !result) {
      void doSubmit(-1);
    }
  }, [view.isDefender, remain, result, doSubmit]);

  const doAssign = async (cardId: string) => {
    setBusy(true);
    setError(null);
    const r = await assignPvpCard(view.matchId, cardId);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    refresh();
  };

  // ================= จบแมตช์ =================
  if (view.status === "finished" || view.status === "abandoned") {
    const abandoned = view.status === "abandoned";
    return (
      <main className="mx-auto max-w-xl px-4 py-10 pb-24 text-center">
        <div className="mt-6 flex items-center gap-3">
          <HpBar label={view.meName} hp={view.hpMine} hpMax={view.hpMineMax} mine />
          <HpBar label={view.oppName} hp={view.hpOpp} hpMax={view.hpOppMax} mine={false} />
        </div>
        <div className="mt-10">
          {abandoned ? (
            <p className="text-xl font-bold text-text2">การประลองถูกพักไว้ — ไม่มีผลกับสถิติ</p>
          ) : view.iWon === null ? (
            <p className="text-2xl font-bold text-gold-hi">สูสีมาก! เสมอกันพอดี</p>
          ) : view.iWon ? (
            <p className="text-2xl font-bold text-gold-hi">ดวลมันส์มาก! ชนะไปแล้ว 🎉</p>
          ) : (
            <p className="text-2xl font-bold text-text">
              สู้ดีมาก! {view.oppName} สู้จนนาทีสุดท้าย
            </p>
          )}
          <p className="mt-2 text-sm text-text3">จบที่ยกที่ {view.currentRound}</p>
        </div>
        <Link
          href="/pvp"
          className="mt-10 inline-block rounded-2xl border border-gold bg-amber px-6 py-3 font-bold text-track active:scale-95"
        >
          กลับหน้าประลอง
        </Link>
      </main>
    );
  }

  // ================= กำลังดวล =================
  return (
    <main className="mx-auto max-w-xl px-4 py-6 pb-24">
      <div className="flex items-center justify-between">
        <Link href="/pvp" className="text-xs text-text3 underline">
          ← ประลอง
        </Link>
        <span className="text-xs text-text3">ยกที่ {view.currentRound} / {view.maxRounds}</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <HpBar label={view.meName} hp={view.hpMine} hpMax={view.hpMineMax} mine />
        <HpBar label={view.oppName} hp={view.hpOpp} hpMax={view.hpOppMax} mine={false} />
      </div>

      {error && <p className="mt-4 text-sm text-red">{error}</p>}

      {/* ---- ผลตอบล่าสุด ---- */}
      {result && (
        <div className="mt-6 rounded-2xl border border-gold-dim bg-card p-6 text-center">
          {result.is_correct ? (
            <p className="text-xl font-bold text-gold-hi">ตอบถูก! ไม่เสียเลือด</p>
          ) : (
            <>
              <p className="text-xl font-bold text-text2">ยังไม่ถูก…</p>
              <p className="mt-2 text-lg font-bold text-red">
                −{result.damage} เลือด {result.crit && <span className="text-amber">คริ ✦</span>}
              </p>
            </>
          )}
          <p className="mt-3 text-xs text-text3">กำลังไปตาต่อไป…</p>
        </div>
      )}

      {/* ---- ผู้ส่ง: เลือกการ์ด ---- */}
      {!result && view.isAttacker && (
        <section className="mt-6">
          <h2 className="text-sm font-bold text-text2">เลือกการ์ดโจทย์ให้ {view.oppName} ทำ</h2>
          <p className="mt-1 text-xs text-text3">
            ตอบถูก = ไม่มีอะไรเกิดขึ้น · ตอบผิด = เสียเลือดตามพลังโจมตีของคุณ
          </p>
          <div className="mt-3 grid gap-2">
            {view.hand.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => void doAssign(c.id)}
                className="rounded-xl border border-border bg-track px-4 py-3 text-left transition active:scale-[0.98] disabled:opacity-50"
              >
                <p className="text-sm font-bold text-text">{c.chapter}</p>
                <p className="text-xs text-text3">
                  {c.subject === "math" ? "คณิต" : "วิทย์"} · ความยาก {c.difficulty}
                </p>
              </button>
            ))}
            {view.hand.length === 0 && (
              <p className="py-6 text-center text-sm text-text3">กำลังจั่วการ์ด…</p>
            )}
          </div>
        </section>
      )}

      {/* ---- ผู้ตอบ: ทำโจทย์ ---- */}
      {!result && view.isDefender && view.activeQuestion && (
        <section className="mt-6">
          <div className="h-2 w-full overflow-hidden rounded-full bg-track">
            <div
              className="h-full bg-amber transition-[width] duration-1000 ease-linear"
              style={{ width: `${(remain / view.timerSeconds) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-text3">{remain} วิ</p>

          <p className="mt-2 text-xs text-text3">
            {view.activeQuestion.chapter} · ตอบผิดเสีย ~
            {pvpEstimatedDamage(view.statsOpp, view.statsMine)} เลือด
          </p>

          {view.activeQuestion.imageUrl && (
            <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl bg-track">
              <Image
                src={view.activeQuestion.imageUrl}
                alt=""
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          )}

          <p className="mt-3 whitespace-pre-wrap font-sarabun text-base font-medium text-text">
            {view.activeQuestion.questionText}
          </p>

          <div className="mt-4 grid gap-2">
            {view.activeQuestion.choices.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => void doSubmit(i)}
                className="rounded-xl border border-border bg-track px-4 py-3 text-left text-sm text-text transition active:scale-[0.98] disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---- รอคู่ต่อสู้ ---- */}
      {!result && !view.myTurn && (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-bold text-text2">
            {view.phase === "assigning"
              ? `รอ ${view.oppName} เลือกการ์ด…`
              : `รอ ${view.oppName} ตอบโจทย์…`}
          </p>
          <p className="mt-2 text-xs text-text3">ปิดแอปได้ กลับมาเล่นต่อได้ภายใน 3 วัน</p>
        </div>
      )}
    </main>
  );
}
