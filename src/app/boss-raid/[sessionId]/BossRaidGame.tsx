"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { tsMs, type BossRaidActiveEvent } from "@/lib/bossRaid/activeEvent";

// Phase 0.3 — จอเล่นของนักเรียน (§12.3 timer จาก deadline timestamp, §12.4 resume ข้อค้าง)
// - get_next_boss_raid_question: resume-aware (server คืนข้อเดิมถ้ายังค้าง) -> ไม่ต้องอ่าน questions เอง
// - submit_boss_raid_answer: idempotent -> กด/submit ซ้ำไม่หักเลือดซ้ำ
// Phase 2 — event "นักรบถูกเลือก": freeze คำถามปกติทั้งห้อง
//   * คนที่ถูกเลือก -> จอคำถามพิเศษ (โจทย์+ตัวเลือกจาก active_event) ตอบผ่าน submit_chosen_warrior_answer
//   * คนอื่น -> overlay "รอนักรบตอบ" หยุด timer + auto-submit ไว้ก่อน พอ event จบ server ดัน
//     question_started_at ไปข้างหน้า -> reload ข้อเดิมด้วยเวลาที่เหลือ

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
  status?: "in_progress" | "ended" | "lobby";
  result?: "win" | "lose" | null;
  frozen?: boolean;
  combo_burst?: boolean;
};

type ChosenResult = {
  is_correct: boolean;
  is_crit: boolean;
  damage_dealt: number;
  crystal_damage: number;
  boss_hp: number;
  crystal_hp: number;
  status?: "in_progress" | "ended";
  result?: "win" | "lose" | null;
  already_resolved?: boolean;
  event_active?: boolean;
};

type Phase = "loading" | "answering" | "submitting" | "result" | "error" | "ended";

const TIER_TH: Record<string, string> = { light: "เบา", medium: "กลาง", heavy: "แรง" };
const STAT_TH: Record<string, string> = {
  hp: "พลังชีวิต",
  atk: "พลังโจมตี",
  def: "พลังป้องกัน",
  spd: "ความเร็ว",
  foc: "สมาธิ",
};

export default function BossRaidGame({
  participantId,
  currentQuestionId,
  questionStartedAt,
  activeEvent,
  bossHp,
  bossHpMax,
  crystalHp,
  crystalHpMax,
  currentTier,
}: {
  participantId: string;
  currentQuestionId: number | null;
  questionStartedAt: string | null;
  activeEvent: BossRaidActiveEvent;
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

  const cw = activeEvent?.type === "chosen_warrior" ? activeEvent : null;
  const amChosen = cw?.chosen_participant_id === participantId;
  const frozen = !!cw && !amChosen;

  const [cwResult, setCwResult] = useState<ChosenResult | null>(null);
  const [cwBusy, setCwBusy] = useState(false);
  const cwSubmittedRef = useRef(false);
  const prevCwRef = useRef<string | null>(null);

  // บัฟดาเมจ passive (จุดอ่อนเผย / บอสโกรธ) — banner นับถอยหลังเอง (expires_at ผ่านไปเงียบๆ ไม่มี realtime)
  const timedBuff =
    activeEvent?.type === "weak_point" || activeEvent?.type === "enrage" ? activeEvent : null;
  const [buffNow, setBuffNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timedBuff) return;
    const t = window.setInterval(() => setBuffNow(Date.now()), 500);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedBuff?.type, timedBuff?.expires_at]);
  const buff = timedBuff && tsMs(timedBuff.expires_at) > buffNow ? timedBuff : null;

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
      const d = data as (QState & { frozen?: boolean; chosen_warrior?: boolean }) | null;
      // event "นักรบถูกเลือก" กำลังทำงาน — จอถูกคุมด้วย activeEvent prop แทน ไม่ต้อง setQ
      if (d?.frozen || d?.chosen_warrior) {
        loadingRef.current = false;
        return;
      }
      submittedRef.current = false;
      setResult(null);
      setError(null);
      setQ(d as QState);
      setPhase("answering");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "โหลดคำถามไม่สำเร็จ";
      if (msg.includes("จบแล้ว")) {
        setPhase("ended");
        return;
      }
      setError(msg);
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
        const res = data as AnswerResult;
        // โดน freeze ระหว่างส่ง (event นักรบถูกเลือก) — ยังไม่บันทึก กลับไปรอ
        if (res.frozen) {
          submittedRef.current = false;
          setPhase("answering");
          return;
        }
        setResult(res);
        setPhase("result");
        if (res.status === "ended") {
          window.setTimeout(() => setPhase("ended"), 1800);
        } else {
          window.setTimeout(() => void loadQuestion(), 1800);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "ส่งคำตอบไม่สำเร็จ";
        if (msg.includes("หมดอายุ")) {
          void loadQuestion();
          return;
        }
        if (msg.includes("เกมจบ")) {
          setPhase("ended");
          return;
        }
        submittedRef.current = false;
        setError(msg);
        setPhase("error");
      }
    },
    [participantId, supabase, loadQuestion]
  );

  const submitChosen = useCallback(
    async (answerIndex: number) => {
      if (cwSubmittedRef.current) return;
      cwSubmittedRef.current = true;
      setCwBusy(true);
      try {
        const { data, error: err } = await supabase.rpc("submit_chosen_warrior_answer", {
          p_participant_id: participantId,
          p_answer: String(answerIndex),
        });
        if (err) throw new Error(err.message);
        setCwResult(data as ChosenResult);
      } catch (e) {
        cwSubmittedRef.current = false;
        setCwBusy(false);
        setError(e instanceof Error ? e.message : "ส่งคำตอบไม่สำเร็จ");
      }
    },
    [participantId, supabase]
  );

  // โหลดข้อแรก / resume ตอน mount
  useEffect(() => {
    const t = window.setTimeout(loadQuestion, 0);
    return () => window.clearTimeout(t);
  }, [loadQuestion]);

  // §12.4 — current_question_id / question_started_at ของ row ตัวเองเปลี่ยน (แท็บอื่นตอบ / reconnect /
  //   server ดัน started_at หลัง freeze) -> โหลดใหม่ ยกเว้นตอนกำลังดูผล/ส่ง/จบ/ถูก freeze
  useEffect(() => {
    if (loadingRef.current || frozen) return;
    if (
      phaseRef.current === "result" ||
      phaseRef.current === "submitting" ||
      phaseRef.current === "ended"
    )
      return;
    const sameQ = (currentQuestionId ?? null) === (qRef.current?.question_id ?? null);
    const sameStart = (questionStartedAt ?? null) === (qRef.current?.question_started_at ?? null);
    if (sameQ && sameStart) return;
    const t = window.setTimeout(loadQuestion, 0);
    return () => window.clearTimeout(t);
  }, [currentQuestionId, questionStartedAt, frozen, loadQuestion]);

  // event "นักรบถูกเลือก" เปลี่ยนสถานะ (เริ่ม/จบ/เปลี่ยนคน) — reset state ของ event, และ resume
  //   คำถามปกติเมื่อ event จบ (server ดัน question_started_at ไปข้างหน้าแล้ว)
  useEffect(() => {
    const key = cw ? `${cw.chosen_participant_id}:${cw.started_at}` : null;
    const prev = prevCwRef.current;
    prevCwRef.current = key;
    if (key === prev) return;
    const t = window.setTimeout(() => {
      cwSubmittedRef.current = false;
      setCwResult(null);
      setCwBusy(false);
      setError(null);
      if (!key) void loadQuestion();
    }, 0);
    return () => window.clearTimeout(t);
  }, [cw, loadQuestion]);

  // ticker timer bar — หยุดตอน freeze
  useEffect(() => {
    if (phase !== "answering" || frozen) return;
    const t = window.setInterval(() => setNowTs(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [phase, frozen]);

  const deadlineMs = q ? new Date(q.deadline).getTime() : 0;
  const remainMs = Math.max(0, deadlineMs - nowTs);

  // หมดเวลา -> auto submit — ไม่ทำงานระหว่าง freeze
  useEffect(() => {
    if (phase !== "answering" || frozen || !q || remainMs > 0 || submittedRef.current) return;
    const id = window.setTimeout(() => void submit(null), 0);
    return () => window.clearTimeout(id);
  }, [phase, frozen, remainMs, q, submit]);

  const shownBossHp = cwResult?.boss_hp ?? result?.boss_hp ?? bossHp ?? 0;
  const bossPct = bossHpMax ? Math.max(0, (shownBossHp / bossHpMax) * 100) : 0;
  const timerPct = q ? Math.max(0, (remainMs / (q.personal_timer_seconds * 1000)) * 100) : 0;

  const shownCrystalHp = cwResult?.crystal_hp ?? result?.crystal_hp ?? crystalHp ?? 0;
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

      {/* ===== บัฟดาเมจ passive (จุดอ่อนเผย / บอสโกรธ) ===== */}
      {buff && (
        <div
          className={`mb-3 rounded-xl px-3 py-2 text-center text-sm font-bold ${
            buff.type === "enrage"
              ? "border border-red bg-red/10 text-red"
              : "border border-gold bg-amber/10 text-gold-hi"
          }`}
        >
          {buff.type === "enrage"
            ? `🔥 บอสโกรธ! ตอบถูกช่วงนี้ ดาเมจ ×${buff.multiplier}`
            : `✦ จุดอ่อนเผย! ตอบถูกช่วงนี้ ดาเมจ ×${buff.multiplier ?? 2}`}
        </div>
      )}

      {/* ===== event: นักรบถูกเลือก ===== */}
      {cw && !amChosen && (
        <div className="rounded-xl border border-amber bg-amber/10 p-6 text-center">
          <p className="text-lg font-bold text-gold-hi">⚔️ นักรบถูกเลือก</p>
          <p className="mt-2 text-base font-bold text-text">{cw.chosen_name}</p>
          <p className="mt-1 text-sm text-text3">
            {cw.criterion === "total"
              ? "สเตตัสรวมสูง — กำลังตอบคำถามแทนทั้งห้อง"
              : `${STAT_TH[cw.stat_key ?? ""] ?? cw.stat_key} สูง — กำลังตอบคำถามแทนทั้งห้อง`}
          </p>
          <p className="mt-4 animate-pulse text-xs text-text3">รอผลการตอบ…</p>
        </div>
      )}

      {cw && amChosen && (
        <div className="rounded-xl border-2 border-gold bg-amber/10 p-4">
          <p className="text-center text-sm font-bold text-gold-hi">
            ⚔️ คุณคือนักรบที่ถูกเลือก!
          </p>
          <p className="mt-1 text-center text-xs text-text3">
            {cw.criterion === "total"
              ? `สเตตัสรวมของคุณ ${cw.stat_value} — สูงสุดที่ถูกสุ่มได้`
              : `${STAT_TH[cw.stat_key ?? ""] ?? cw.stat_key} ของคุณ ${cw.stat_value}`}
          </p>
          <p className="mt-1 text-center text-xs font-bold text-red">
            ตอบถูก บอสเสียเลือด ×3 · ตอบผิด คริสตัลแตกหนัก ×2.5
          </p>

          {cwResult ? (
            <div className="py-6 text-center">
              {cwResult.is_correct ? (
                <>
                  <p className="text-2xl font-bold text-gold-hi">
                    ตอบถูก! {cwResult.is_crit && <span className="text-amber">คริติคอล ✦</span>}
                  </p>
                  <p className="mt-2 text-lg font-bold text-red">−{cwResult.damage_dealt} HP บอส</p>
                </>
              ) : cwResult.already_resolved || cwResult.event_active === false ? (
                <p className="text-lg font-bold text-text2">อีเวนต์จบไปแล้ว</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-text2">ยังไม่ถูก…</p>
                  <p className="mt-2 text-lg font-bold text-red">
                    คริสตัล −{cwResult.crystal_damage} HP
                  </p>
                </>
              )}
              <p className="mt-3 text-xs text-text3">กำลังกลับสู่คำถามปกติ…</p>
            </div>
          ) : (
            <>
              <p className="mt-4 whitespace-pre-wrap font-sarabun text-base font-medium text-text">
                {cw.question_text}
              </p>
              <div className="mt-4 grid gap-2">
                {cw.choices.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={cwBusy}
                    onClick={() => void submitChosen(i)}
                    className="rounded-xl border border-gold-dim bg-track px-4 py-3 text-left text-sm text-text transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}
          {error && <p className="mt-2 text-center text-sm text-red">{error}</p>}
        </div>
      )}

      {/* ===== flow ปกติ (ซ่อนตอนมี event นักรบถูกเลือก) ===== */}
      {!cw && (
        <>
          {phase === "loading" && (
            <p className="py-8 text-center text-sm text-text3">กำลังโหลดคำถาม…</p>
          )}

          {phase === "ended" && (
            <p className="py-8 text-center text-lg font-bold text-text2">เกมจบแล้ว</p>
          )}

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

              <p className="mt-3 whitespace-pre-wrap font-sarabun text-base font-medium text-text">
                {q.question_text}
              </p>

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
              {result.combo_burst && (
                <p className="mt-2 text-sm font-bold text-indigo-hi">
                  🔥 พลังรวมพลัง! ทั้งห้อง −40 เพิ่ม
                </p>
              )}
              <p className="mt-3 text-xs text-text3">กำลังไปข้อต่อไป…</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
