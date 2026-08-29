"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

// Phase 0.3 — จอเล่นของนักเรียน (§12.3 timer จาก deadline timestamp, §12.4 resume ข้อค้าง)
// - get_next_boss_raid_question: resume-aware (server คืนข้อเดิมถ้ายังค้าง) -> ไม่ต้องอ่าน questions เอง
// - submit_boss_raid_answer: idempotent -> กด/submit ซ้ำไม่หักเลือดซ้ำ

type QState = {
  question_id: number;
  question_text: string;
  choices: string[];
  image_url: string | null;
  question_started_at: string;
  deadline: string;
  personal_timer_seconds: number;
};

type AnswerResult = {
  idempotent: boolean;
  is_correct: boolean;
  is_crit: boolean;
  damage_dealt: number;
  boss_hp: number;
  crystal_hp: number | null;
  current_tier: "light" | "medium" | "heavy" | null;
  crystal_damage: number | null;
};

type Phase = "loading" | "answering" | "submitting" | "result" | "error";

const TIER_TH: Record<string, string> = { light: "เบา", medium: "กลาง", heavy: "แรง" };

export default function BossRaidGame({
  participantId,
  currentQuestionId,
  bossHp,
  bossHpMax,
  crystalHp,
  crystalHpMax,
  currentTier,
}: {
  participantId: string;
  currentQuestionId: number | null;
  bossHp: number | null | undefined;
  bossHpMax: number | null | undefined;
  crystalHp: number | null | undefined;
  crystalHpMax: number | null | undefined;
  currentTier: string | null | undefined;
}) {
  const supabase = createClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [q, setQ] = useState<QState | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const loadingRef = useRef(false);
  const submittedRef = useRef(false);
  const qRef = useRef<QState | null>(null);
  const phaseRef = useRef<Phase>(phase);

  useEffect(() => {
    qRef.current = q;
  }, [q]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const loadQuestion = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data, error: err } = await supabase.rpc("get_next_boss_raid_question", {
        p_participant_id: participantId,
      });
      if (err) throw new Error(err.message);
      submittedRef.current = false;
      setResult(null);
      setError(null);
      setQ(data as QState);
      setPhase("answering");
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดคำถามไม่สำเร็จ");
      setPhase("error");
    } finally {
      loadingRef.current = false;
    }
  }, [participantId, supabase]);

  const submit = useCallback(
    async (answerIndex: number | null) => {
      const cq = qRef.current;
      if (submittedRef.current || !cq) return;
      submittedRef.current = true;
      setPhase("submitting");
      try {
        const { data, error: err } = await supabase.rpc("submit_boss_raid_answer", {
          p_participant_id: participantId,
          p_question_id: cq.question_id,
          p_question_started_at: cq.question_started_at,
          p_answer: answerIndex === null ? "" : String(answerIndex),
        });
        if (err) throw new Error(err.message);
        setResult(data as AnswerResult);
        setPhase("result");
        window.setTimeout(() => void loadQuestion(), 1800);
      } catch (e) {
        // ข้อหมดอายุ / เกมจบ — ขอสถานะใหม่จาก server แทนค้างจอ
        const msg = e instanceof Error ? e.message : "ส่งคำตอบไม่สำเร็จ";
        if (msg.includes("หมดอายุ")) {
          void loadQuestion();
          return;
        }
        submittedRef.current = false;
        setError(msg);
        setPhase("error");
      }
    },
    [participantId, supabase, loadQuestion]
  );

  // โหลดข้อแรก / resume ตอน mount (เปิดแอปใหม่หลังปิดระหว่างมีข้อค้าง -> server คืนข้อเดิม)
  useEffect(() => {
    const t = window.setTimeout(loadQuestion, 0);
    return () => window.clearTimeout(t);
  }, [loadQuestion]);

  // §12.4 — realtime: current_question_id ของ row ตัวเองเปลี่ยน (แท็บอื่นตอบ / reconnect)
  useEffect(() => {
    if (loadingRef.current) return;
    if (phaseRef.current === "result" || phaseRef.current === "submitting") return;
    const pid = currentQuestionId ?? null;
    if (pid === (qRef.current?.question_id ?? null)) return;
    const t = window.setTimeout(loadQuestion, 0);
    return () => window.clearTimeout(t);
  }, [currentQuestionId, loadQuestion]);

  // ticker สำหรับ timer bar (เฉพาะตอนตอบอยู่)
  useEffect(() => {
    if (phase !== "answering") return;
    const t = window.setInterval(() => setNowTs(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [phase]);

  const deadlineMs = q ? new Date(q.deadline).getTime() : 0;
  const remainMs = Math.max(0, deadlineMs - nowTs);

  // หมดเวลา -> auto submit (นับเป็นผิด ฝั่ง server). defer ออกจาก effect body 1 tick
  useEffect(() => {
    if (phase !== "answering" || !q || remainMs > 0 || submittedRef.current) return;
    const id = window.setTimeout(() => void submit(null), 0);
    return () => window.clearTimeout(id);
  }, [phase, remainMs, q, submit]);

  const shownBossHp = result?.boss_hp ?? bossHp ?? 0;
  const bossPct = bossHpMax ? Math.max(0, (shownBossHp / bossHpMax) * 100) : 0;
  const timerPct = q ? Math.max(0, (remainMs / (q.personal_timer_seconds * 1000)) * 100) : 0;

  const shownCrystalHp = result?.crystal_hp ?? crystalHp ?? 0;
  const crystalPct = crystalHpMax ? Math.max(0, (shownCrystalHp / crystalHpMax) * 100) : 0;
  const shownTier = result?.current_tier ?? currentTier ?? "light";
  const crystalHit = phase === "result" && (result?.crystal_damage ?? 0) > 0;

  return (
    <section className="mt-6 rounded-2xl border border-gold-dim bg-card p-4">
      {/* บอส HP */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-text3">
          <span>บอส HP</span>
          <span>
            {shownBossHp} / {bossHpMax ?? "?"}
          </span>
        </div>
        <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-track">
          <div className="h-full bg-red transition-all" style={{ width: `${bossPct}%` }} />
        </div>
      </div>

      {/* คริสตัล HP + ระดับบอส (tier) */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-text3">
          <span>
            คริสตัล HP <span className="text-text2">· บอสระดับ{TIER_TH[shownTier] ?? "เบา"}</span>
          </span>
          <span>
            {shownCrystalHp} / {crystalHpMax ?? "?"}
          </span>
        </div>
        <div
          className={`mt-1 h-3 w-full overflow-hidden rounded-full bg-track transition-colors ${
            crystalHit ? "ring-2 ring-red" : ""
          }`}
        >
          <div
            className="h-full bg-indigo-hi transition-all"
            style={{ width: `${crystalPct}%` }}
          />
        </div>
        {crystalHit && (
          <p className="mt-1 text-right text-xs font-bold text-red">
            บอสฟาดคริสตัล −{result?.crystal_damage} HP
          </p>
        )}
      </div>

      {phase === "loading" && <p className="py-8 text-center text-sm text-text3">กำลังโหลดคำถาม…</p>}

      {phase === "error" && (
        <div className="py-6 text-center">
          <p className="text-sm text-red">{error}</p>
          <button
            type="button"
            onClick={() => void loadQuestion()}
            className="mt-3 rounded-xl border border-gold-dim bg-track px-4 py-2 text-sm font-bold text-gold-hi active:scale-95"
          >
            ขอคำถามใหม่
          </button>
        </div>
      )}

      {(phase === "answering" || phase === "submitting") && q && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-track">
            <div
              className="h-full bg-amber transition-[width] duration-200 ease-linear"
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-text3">{Math.ceil(remainMs / 1000)} วิ</p>

          {q.image_url && (
            <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-xl bg-track">
              <Image src={q.image_url} alt="" fill className="object-contain" unoptimized />
            </div>
          )}

          <p className="mt-3 whitespace-pre-wrap text-base font-medium text-text">{q.question_text}</p>

          <div className="mt-4 grid gap-2">
            {q.choices.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={phase !== "answering"}
                onClick={() => void submit(i)}
                className="rounded-xl border border-border bg-track px-4 py-3 text-left text-sm text-text transition active:scale-[0.98] disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}

      {phase === "result" && result && (
        <div className="py-8 text-center">
          {result.is_correct ? (
            <>
              <p className="text-2xl font-bold text-gold-hi">
                ตอบถูก! {result.is_crit && <span className="text-amber">คริติคอล ✦</span>}
              </p>
              <p className="mt-2 text-lg font-bold text-red">−{result.damage_dealt} HP</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-text2">ยังไม่ถูกนะ</p>
          )}
          <p className="mt-3 text-xs text-text3">กำลังไปข้อต่อไป…</p>
        </div>
      )}
    </section>
  );
}
