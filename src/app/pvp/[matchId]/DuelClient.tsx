"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PvpMatchView } from "@/lib/pvp";
import { pvpEstimatedDamage } from "@/lib/pvp/combat";
import { usePvpMatch } from "@/lib/pvp/usePvpMatch";
import { assignPvpCard, drawPvpCards, submitPvpCard, type PvpSubmitResult } from "../actions";

// accent ต่อฝั่ง — เรา = น้ำเงิน (--color-indigo), คู่ต่อสู้ = แดง (--color-red)
const ACCENT = {
  mine: { hp: "bg-indigo", pill: "bg-indigo/15 text-indigo-hi", rgba: "112,137,209" },
  opp: { hp: "bg-red", pill: "bg-red/15 text-red", rgba: "216,54,47" },
} as const;

// คลัสเตอร์ของ 1 ฝั่ง: สไปรต์ + ป้ายชื่อ + แถบ HP — วางชิดขอบด้านของตัวเอง (opp=ขวาบน, mine=ซ้ายล่าง)
function PetSide({
  image,
  name,
  hp,
  hpMax,
  side,
  glow,
  hit,
}: {
  image: string | null;
  name: string;
  hp: number;
  hpMax: number;
  side: "mine" | "opp";
  glow: boolean;
  hit: boolean;
}) {
  const a = ACCENT[side];
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, hpMax)) * 100));
  const opp = side === "opp";
  return (
    <div className={`flex items-center gap-3 ${opp ? "flex-row-reverse" : ""}`}>
      {/* สไปรต์ */}
      <div className="relative h-20 w-20 shrink-0">
        {/* แท่นพลังงานที่พื้นใต้เท้า — จานแบน accent สว่างขึ้นตอนถึงตา */}
        <div
          className={`pointer-events-none absolute left-1/2 top-[80%] h-5 w-20 -translate-x-1/2 rounded-[50%] blur-[3px] ${
            glow ? "animate-pvp-platform-pulse" : ""
          }`}
          style={{
            background: `radial-gradient(ellipse at center, rgba(${a.rgba},${glow ? 0.9 : 0.28}) 0%, transparent 75%)`,
          }}
        />
        <div className="pointer-events-none absolute left-1/2 top-[86%] h-2 w-12 -translate-x-1/2 rounded-[50%] bg-black/50 blur-[2px]" />
        {/* เรืองแสง accent ตอนถึงตา (box-shadow นุ่ม) */}
        <div
          className="relative h-full w-full rounded-full transition-shadow duration-300"
          style={
            glow
              ? { boxShadow: `0 0 0 2px rgba(${a.rgba},0.9), 0 0 16px 4px rgba(${a.rgba},0.5)` }
              : undefined
          }
        >
          <div
            className={`relative h-full w-full ${hit ? "animate-pvp-hit" : "animate-pvp-idle-bob"}`}
            style={!hit && opp ? { animationDelay: "-1.6s" } : undefined}
          >
            {image && (
              <Image
                src={image}
                alt={name}
                fill
                unoptimized
                className={`object-contain ${hit ? "pvp-hit-flash" : ""}`}
                style={opp ? { transform: "scaleX(-1)" } : undefined}
              />
            )}
          </div>
        </div>
      </div>
      {/* ชื่อ + HP */}
      <div className={`w-[9.5rem] ${opp ? "text-right" : ""}`}>
        <span
          className={`inline-block max-w-full truncate rounded-md px-2 py-0.5 text-xs font-bold ${a.pill}`}
          title={name}
        >
          {name}
        </span>
        <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
          <div className={`h-full ${a.hp} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-0.5 text-[10px] text-text3">
          {Math.max(0, hp)} / {hpMax}
        </p>
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

  const holdRef = useRef(false);
  const refresh = useCallback(() => {
    if (holdRef.current) return;
    router.refresh();
  }, [router]);
  usePvpMatch(view.matchId, refresh);

  // ---- hit feedback: จับ hp ที่ลดลงระหว่าง render -> ประกาย VS + สั่นตัวที่โดน ----
  const [hitMine, setHitMine] = useState(false);
  const [hitOpp, setHitOpp] = useState(false);
  const [spark, setSpark] = useState(0); // เปลี่ยนค่า = trigger animation ใหม่
  const prevHp = useRef({ mine: view.hpMine, opp: view.hpOpp });
  useEffect(() => {
    const dMine = view.hpMine < prevHp.current.mine;
    const dOpp = view.hpOpp < prevHp.current.opp;
    prevHp.current = { mine: view.hpMine, opp: view.hpOpp };
    if (!dMine && !dOpp) return;
    setSpark((n) => n + 1);
    if (dMine) setHitMine(true);
    if (dOpp) setHitOpp(true);
    const t = window.setTimeout(() => {
      setHitMine(false);
      setHitOpp(false);
    }, 600);
    return () => window.clearTimeout(t);
  }, [view.hpMine, view.hpOpp]);

  // attacker: มือว่าง (edge case) -> จั่วเอง
  useEffect(() => {
    if (view.status !== "active" || !view.isAttacker || view.hand.length > 0) return;
    void drawPvpCards(view.matchId).then((r) => {
      if (r.ok) refresh();
      else setError(r.message);
    });
  }, [view.status, view.isAttacker, view.hand.length, view.matchId, refresh]);

  // ---- ผู้ตอบ: timer (display เท่านั้น — หมดเวลา = auto-submit -1) ----
  const [remain, setRemain] = useState(view.timerSeconds);
  useEffect(() => {
    if (!view.isDefender || result) return;
    const t = window.setInterval(() => setRemain((s) => (s <= 1 ? 0 : s - 1)), 1000);
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

  const glowMine = view.status === "active" && view.myTurn;
  const glowOpp = view.status === "active" && !view.myTurn;

  const battleStage = (
    // A.1/A.4 — ขนาดคงที่ทุก state (w เต็ม, h 240px). คลัสเตอร์สองฝั่ง absolute ชิดมุมของตัวเอง
    <div className="relative h-60 w-full overflow-hidden rounded-2xl border border-gold-dim bg-gradient-to-b from-[#23252c] to-track">
      {/* ลำแสงกลาง + แสงเรืองที่จุด VS */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-gold/25 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/10 blur-2xl" />

      {/* คู่ต่อสู้ — ขวาบน */}
      <div className="absolute right-4 top-4">
        <PetSide
          image={view.petOppImage}
          name={view.petOppName}
          hp={view.hpOpp}
          hpMax={view.hpOppMax}
          side="opp"
          glow={glowOpp}
          hit={hitOpp}
        />
      </div>

      {/* VS — กลางจริง */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/25 blur-md" />
        {spark > 0 && (
          <span
            key={spark}
            className="animate-pvp-vs-spark pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-white/80"
            style={{ boxShadow: "0 0 24px 8px rgba(255,255,255,0.6)" }}
          />
        )}
        <span className="relative text-sm font-black tracking-[0.3em] text-gold-hi">VS</span>
      </div>

      {/* เรา — ซ้ายล่าง */}
      <div className="absolute bottom-4 left-4">
        <PetSide
          image={view.petMineImage}
          name={view.petMineName}
          hp={view.hpMine}
          hpMax={view.hpMineMax}
          side="mine"
          glow={glowMine}
          hit={hitMine}
        />
      </div>
    </div>
  );

  // ================= จบแมตช์ =================
  if (view.status === "finished" || view.status === "abandoned") {
    const abandoned = view.status === "abandoned";
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-8 pb-24">
        {battleStage}
        <div className="mt-8 text-center">
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
          className="mx-auto mt-8 block w-fit rounded-2xl border border-gold bg-amber px-6 py-3 font-bold text-track active:scale-95"
        >
          กลับหน้าประลอง
        </Link>
      </main>
    );
  }

  // ================= กำลังดวล =================
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-4 pb-24">
      <div className="mb-2 flex items-center justify-between">
        <Link href="/pvp" className="text-xs text-text3 underline">
          ← ประลอง
        </Link>
        <span className="text-xs text-text3">
          ยกที่ {view.currentRound} / {view.maxRounds}
        </span>
      </div>

      {battleStage}

      {error && <p className="mt-3 text-sm text-red">{error}</p>}

      {/* ---- ผลตอบล่าสุด ---- */}
      {result && (
        <div className="mt-4 rounded-2xl border border-gold-dim bg-card p-5 text-center">
          {result.is_correct ? (
            <p className="text-xl font-bold text-gold-hi">ตอบถูก! ไม่เสียเลือด</p>
          ) : (
            <>
              <p className="text-lg font-bold text-text2">ยังไม่ถูก…</p>
              <p className="mt-1 text-2xl font-bold text-red">
                −{result.damage} {result.crit && <span className="text-amber">คริ ✦</span>}
              </p>
            </>
          )}
          <p className="mt-3 text-xs text-text3">กำลังไปตาต่อไป…</p>
        </div>
      )}

      {/* ---- ผู้ส่ง: เลือกการ์ด ---- */}
      {!result && view.isAttacker && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-text2">เลือกการ์ดโจทย์ให้ {view.oppName} ทำ</h2>
          <p className="mt-1 text-xs text-text3">
            เขาตอบถูก = ไม่มีอะไรเกิดขึ้น · ตอบผิด = เสียเลือดตามพลังโจมตีของคุณ
          </p>
          <div className="mt-4 grid gap-3">
            {view.hand.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => void doAssign(c.id)}
                className="rounded-xl border border-border bg-track px-4 py-3.5 text-left transition hover:border-gold-dim active:scale-[0.98] disabled:opacity-50"
              >
                <span className="inline-block rounded-full bg-indigo/15 px-2 py-0.5 text-[11px] font-bold text-indigo-hi">
                  {c.subject === "math" ? "คณิต" : "วิทย์"} · ความยาก {c.difficulty}
                </span>
                <p className="mt-1.5 font-sarabun text-sm font-bold text-text">{c.chapter}</p>
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
        <section className="mt-4 rounded-2xl border border-border bg-card p-5">
          {/* timer bar — เหนือโจทย์ */}
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-track">
            <div
              className={`h-full transition-[width] duration-1000 ease-linear ${
                remain <= 10 ? "bg-red" : "bg-amber"
              }`}
              style={{ width: `${Math.max(0, (remain / view.timerSeconds) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-text3">{remain} วิ</p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="inline-block rounded-full bg-indigo/15 px-2.5 py-1 text-xs font-bold text-indigo-hi">
              {view.activeQuestion.subject === "math" ? "คณิต" : "วิทย์"} · {view.activeQuestion.chapter}
            </span>
            <span className="shrink-0 text-xs text-text3">
              ตอบผิดเสีย ~{pvpEstimatedDamage(view.statsOpp, view.statsMine)}
            </span>
          </div>

          {view.activeQuestion.imageUrl && (
            <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl bg-track">
              <Image
                src={view.activeQuestion.imageUrl}
                alt=""
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          )}

          <p className="mt-4 whitespace-pre-wrap font-sarabun text-base font-medium leading-relaxed text-text">
            {view.activeQuestion.questionText}
          </p>

          <div className="mt-5 grid gap-3">
            {view.activeQuestion.choices.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => void doSubmit(i)}
                className="flex items-start gap-3 rounded-xl border border-border bg-track px-4 py-3.5 text-left font-sarabun text-sm text-text transition hover:border-gold-dim active:scale-[0.98] disabled:opacity-50"
              >
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-text3" />
                <span className="leading-relaxed">{c}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---- รอคู่ต่อสู้ ---- */}
      {!result && !view.myTurn && (
        <div className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center">
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
