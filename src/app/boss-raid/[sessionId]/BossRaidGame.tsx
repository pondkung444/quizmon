"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { tsMs, type BossRaidActiveEvent } from "@/lib/bossRaid/activeEvent";
import { resolveBossRaidBoss } from "@/lib/bossRaidBosses";
import QuizQuestionImage from "@/components/quiz/QuizQuestionImage";

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
  // Item 4a — ตอบผิดติดกัน 3 -> พักคูลดาวน์ 30 วิ (ค่าติดมากับผลข้อที่ 3, และมากับ submit ที่ถูกบล็อก)
  cooldown?: boolean;
  cooldown_until?: string | null;
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

// submit_boss_raid_event_answer (meteor / ฝนดาวตก)
type MeteorResult = {
  event_active: boolean;
  already_answered?: boolean;
  is_correct: boolean | null;
  won?: boolean;
  bonus_damage?: number;
  boss_hp?: number;
  status?: "in_progress" | "ended";
  result?: "win" | "lose" | null;
};

type Phase = "loading" | "answering" | "submitting" | "result" | "error" | "ended" | "cooldown";

const TIER_TH: Record<string, string> = { light: "เบา", medium: "กลาง", heavy: "แรง" };
const THAI_LETTERS = ["ก", "ข", "ค", "ง"];
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
  bossKey,
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
  /** config.boss_key — รูป/ชื่อบอสบน HUD */
  bossKey?: string | null;
}) {
  const supabase = createClient();
  const boss = resolveBossRaidBoss(bossKey);
  const [phase, setPhase] = useState<Phase>("loading");
  const [q, setQ] = useState<QState | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  // ข้อที่กดเลือก (null = หมดเวลา) — คงคำถามไว้บนจอตอนโชว์ผล แล้วระบายสีเฉพาะข้อนี้
  const [picked, setPicked] = useState<number | null>(null);
  // จำนวนข้อที่ตอบไปแล้วในรอบนี้ (นับฝั่ง client — ไว้โชว์ "ข้อ N" เท่านั้น)
  const [answered, setAnswered] = useState(0);
  // Item 4a — คูลดาวน์รายคน (ตอบผิดติดกัน 3 -> พัก 30 วิ)
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);

  const cw = activeEvent?.type === "chosen_warrior" ? activeEvent : null;
  const amChosen = cw?.chosen_participant_id === participantId;

  const [cwResult, setCwResult] = useState<ChosenResult | null>(null);
  const [cwBusy, setCwBusy] = useState(false);
  const cwSubmittedRef = useRef(false);
  const prevCwRef = useRef<string | null>(null);

  // ===== meteor (ฝนดาวตก) — คำถามโบนัสทั้งห้อง, คนแรกที่ตอบถูกได้ +15 =====
  // backend freeze คำถามปกติไว้ตลอดช่วง event (submit_boss_raid_answer / get_next_boss_raid_question
  // คืน frozen:true; question_started_at ถูกดันไป +15 วิ ตอน event เริ่ม) — จอนี้แค่โชว์ข้อโบนัส
  const meteorEv = activeEvent?.type === "meteor" ? activeEvent : null;
  const [meteorNow, setMeteorNow] = useState(() => Date.now());
  useEffect(() => {
    if (!meteorEv) return;
    const t = window.setInterval(() => setMeteorNow(Date.now()), 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meteorEv?.expires_at]);
  const meteorActive = !!meteorEv && tsMs(meteorEv.expires_at) > meteorNow;
  const meteorRemain = meteorEv
    ? Math.max(0, Math.ceil((tsMs(meteorEv.expires_at) - meteorNow) / 1000))
    : 0;
  const [meteorResult, setMeteorResult] = useState<MeteorResult | null>(null);
  const [meteorBusy, setMeteorBusy] = useState(false);
  const meteorSubmittedRef = useRef(false);
  const prevMeteorActiveRef = useRef(false);
  const prevMeteorKeyRef = useRef<string | null>(null);

  const frozen = (!!cw && !amChosen) || meteorActive;

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
      const d = data as
        | (QState & { frozen?: boolean; chosen_warrior?: boolean; cooldown?: boolean; cooldown_until?: string })
        | null;
      // event "นักรบถูกเลือก" กำลังทำงาน — จอถูกคุมด้วย activeEvent prop แทน ไม่ต้อง setQ
      if (d?.frozen || d?.chosen_warrior) {
        loadingRef.current = false;
        return;
      }
      // Item 4a — กำลังพักคูลดาวน์: โชว์จอ "พักหายใจ" จนหมดเวลา
      if (d?.cooldown) {
        setCooldownUntil(d.cooldown_until ?? null);
        setPhase("cooldown");
        loadingRef.current = false;
        return;
      }
      // กันจอพังทั้งหน้า: payload ที่ไม่ใช่คำถาม (เช่น server เพิ่มสถานะใหม่แต่ client ยังไม่รู้จัก —
      // เคยเกิดกับ {cooldown:true} ที่ q.choices.map พังจน Next ขึ้น "This page couldn't load")
      if (!d || !Array.isArray(d.choices)) throw new Error("โหลดคำถามไม่สำเร็จ");
      submittedRef.current = false;
      setResult(null);
      setError(null);
      setPicked(null);
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
      setPicked(answerIndex);
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
        // Item 4a — ส่งระหว่างพักคูลดาวน์ (auto-submit ค้าง) — ยังไม่บันทึก โชว์จอพัก
        if (res.cooldown) {
          submittedRef.current = false;
          setCooldownUntil(res.cooldown_until ?? null);
          setPhase("cooldown");
          return;
        }
        setResult(res);
        if (!res.idempotent) setAnswered((n) => n + 1);
        setPhase("result");
        if (res.status === "ended") {
          window.setTimeout(() => setPhase("ended"), 1800);
        } else if (res.cooldown_until) {
          // ตอบผิดข้อที่ 3 — โชว์ผลแป๊บนึงแล้วเข้าจอพัก
          window.setTimeout(() => {
            setCooldownUntil(res.cooldown_until ?? null);
            setPhase("cooldown");
          }, 1800);
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

  const submitMeteor = useCallback(
    async (answerIndex: number) => {
      if (meteorSubmittedRef.current) return;
      meteorSubmittedRef.current = true;
      setMeteorBusy(true);
      try {
        const { data, error: err } = await supabase.rpc("submit_boss_raid_event_answer", {
          p_participant_id: participantId,
          p_answer: String(answerIndex),
        });
        if (err) throw new Error(err.message);
        setMeteorResult(data as MeteorResult);
      } catch (e) {
        meteorSubmittedRef.current = false;
        setMeteorBusy(false);
        setError(e instanceof Error ? e.message : "ส่งคำตอบไม่สำเร็จ");
      }
    },
    [participantId, supabase]
  );

  // meteor เริ่มใหม่ (expires_at เปลี่ยน) -> reset state; หมดเวลา -> resume คำถามปกติ
  //   (backend คืน frozen จนถึง expires_at แล้ว unfreeze เอง; question_started_at ถูกดัน +15 วิ
  //    ตอน event เริ่ม -> loadQuestion ได้เวลาที่เหลือคืน)
  useEffect(() => {
    const wasActive = prevMeteorActiveRef.current;
    prevMeteorActiveRef.current = meteorActive;
    const key = meteorEv?.expires_at ?? null;
    const prevKey = prevMeteorKeyRef.current;
    prevMeteorKeyRef.current = key;
    if (key === prevKey && wasActive === meteorActive) return;
    const t = window.setTimeout(() => {
      if (key !== prevKey) {
        meteorSubmittedRef.current = false;
        setMeteorResult(null);
        setMeteorBusy(false);
      }
      if (wasActive && !meteorActive) {
        // กัน auto-submit ยิงคำตอบ null ให้ข้อเก่า (deadline ที่โชว์ยังเป็นของเดิม ก่อน server ดัน +15)
        submittedRef.current = true;
        setPhase("loading");
        void loadQuestion();
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [meteorEv?.expires_at, meteorActive, loadQuestion]);

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
      phaseRef.current === "ended" ||
      phaseRef.current === "cooldown"
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

  // Item 4a — นับถอยหลังคูลดาวน์ แล้วขอข้อใหม่เมื่อครบ
  const cooldownRemain =
    phase === "cooldown" && cooldownUntil
      ? Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - nowTs) / 1000))
      : 0;
  useEffect(() => {
    if (phase !== "cooldown") return;
    const tick = window.setInterval(() => setNowTs(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [phase]);
  useEffect(() => {
    if (phase !== "cooldown") return;
    if (cooldownUntil && new Date(cooldownUntil).getTime() - nowTs > 0) return;
    const t = window.setTimeout(() => {
      setCooldownUntil(null);
      void loadQuestion();
    }, 0);
    return () => window.clearTimeout(t);
  }, [phase, cooldownUntil, nowTs, loadQuestion]);

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

  const secsLeft = Math.ceil(remainMs / 1000);
  const timerTone = timerPct > 50 ? "bg-gold" : timerPct > 25 ? "bg-amber" : "bg-red";
  const lastResultCorrect = phase === "result" && result?.is_correct === true;
  const lastResultWrong = phase === "result" && result?.is_correct === false;

  // สไตล์ชุดเดียวกับหน้า /quiz (quiz-question-card + ปุ่มตัวเลือก ก ข ค ง) — สีมาจาก token ของธีมแอป
  // ([data-app-theme] ใน globals.css) ที่ page.tsx ใส่ให้เฉพาะฝั่งนักเรียน; จอครู/TV คงโทนเดิม
  // server ไม่ส่งเฉลยกลับมา จึงระบายสีเฉพาะข้อที่เลือก (ถูก = เขียว, ผิด = แดง)
  function choiceClass(i: number): string {
    if (picked === i && lastResultCorrect) return "border-correct bg-correct/10";
    if (picked === i && lastResultWrong) return "border-red bg-red/10";
    if (picked === i) return "border-amber bg-amber/10";
    return "border-border bg-card";
  }

  return (
    <section className="mt-5 flex flex-col gap-3">
      {/* ===== HUD: บอส + คริสตัล ===== */}
      <div className="quiz-journey flex items-center gap-3 !px-4 !py-3">
        <div className="relative h-16 w-16 shrink-0" aria-hidden>
          <Image src={boss.sprite} alt="" fill sizes="64px" className="object-contain drop-shadow-lg" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-bold">{boss.nameTh}</span>
              <span className="shrink-0 tabular-nums opacity-80">
                {shownBossHp} / {bossHpMax ?? "?"}
              </span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#ff6a4d] to-[#ffb37a] transition-all duration-500"
                style={{ width: `${bossPct}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate">
                คริสตัล <span className="opacity-80">· บอสระดับ{TIER_TH[shownTier] ?? "เบา"}</span>
              </span>
              <span className="shrink-0 tabular-nums opacity-80">
                {shownCrystalHp} / {crystalHpMax ?? "?"}
              </span>
            </div>
            <div
              className={`mt-1 h-2 w-full overflow-hidden rounded-full bg-black/25 ${
                crystalHit ? "ring-2 ring-red" : ""
              }`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#52d9d4] to-[#bff5f0] transition-all duration-500"
                style={{ width: `${crystalPct}%` }}
              />
            </div>
            {crystalHit && (
              <p className="mt-1 text-right text-xs font-bold text-red">บอสฟาดคริสตัล −{result?.crystal_damage} HP</p>
            )}
          </div>
        </div>
      </div>

      {/* ===== บัฟดาเมจ passive (จุดอ่อนเผย / บอสโกรธ) ===== */}
      {buff && (
        <div
          className={`rounded-2xl px-4 py-2.5 text-center text-sm font-bold ${
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

      {/* ===== event: นักรบถูกเลือก (คนอื่นรอ) ===== */}
      {cw && !amChosen && (
        <div className="quiz-question-card text-center">
          <p className="text-3xl" aria-hidden>
            ⚔️
          </p>
          <p className="mt-2 text-sm font-bold text-gold-hi">นักรบถูกเลือก</p>
          <p className="mt-1 text-xl font-bold text-text">{cw.chosen_name}</p>
          <p className="mt-1 text-sm text-text3">
            {cw.criterion === "total"
              ? "สเตตัสรวมสูง — กำลังตอบคำถามแทนทั้งห้อง"
              : `${STAT_TH[cw.stat_key ?? ""] ?? cw.stat_key} สูง — กำลังตอบคำถามแทนทั้งห้อง`}
          </p>
          <p className="mt-4 animate-pulse text-xs text-text3">รอผลการตอบ…</p>
        </div>
      )}

      {/* ===== event: นักรบถูกเลือก (เราคือนักรบ) ===== */}
      {cw && amChosen && (
        <div className="quiz-question-card flex flex-col gap-4 !border-2 !border-gold">
          <div className="text-center">
            <p className="text-sm font-bold text-gold-hi">⚔️ คุณคือนักรบที่ถูกเลือก!</p>
            <p className="mt-1 text-xs text-text3">
              {cw.criterion === "total"
                ? `สเตตัสรวมของคุณ ${cw.stat_value} — สูงสุดที่ถูกสุ่มได้`
                : `${STAT_TH[cw.stat_key ?? ""] ?? cw.stat_key} ของคุณ ${cw.stat_value}`}
            </p>
            <p className="mt-1 text-xs font-bold text-red">ตอบถูก บอสเสียเลือด ×3 · ตอบผิด คริสตัลแตกหนัก ×2.5</p>
          </div>

          {cwResult ? (
            <div
              role="status"
              className={`rounded-2xl border p-4 text-center ${
                cwResult.is_correct
                  ? "border-correct/40 bg-correct/10 text-correct-text"
                  : "border-border bg-track/40 text-text"
              }`}
            >
              {cwResult.is_correct ? (
                <>
                  <p className="font-sarabun text-xl font-bold">
                    ตอบถูก! {cwResult.is_crit && <span className="text-amber">คริติคอล ✦</span>}
                  </p>
                  <p className="mt-1 text-lg font-bold text-red">−{cwResult.damage_dealt} HP บอส</p>
                </>
              ) : cwResult.already_resolved || cwResult.event_active === false ? (
                <p className="text-lg font-bold">อีเวนต์จบไปแล้ว</p>
              ) : (
                <>
                  <p className="font-sarabun text-xl font-bold">ยังไม่ถูก…</p>
                  <p className="mt-1 text-lg font-bold text-red">คริสตัล −{cwResult.crystal_damage} HP</p>
                </>
              )}
              <p className="mt-2 text-xs text-text3">กำลังกลับสู่คำถามปกติ…</p>
            </div>
          ) : (
            <>
              <h2 className="whitespace-pre-wrap font-sarabun text-lg font-bold leading-relaxed text-text">
                {cw.question_text}
              </h2>
              <ChoiceList
                choices={cw.choices}
                disabled={cwBusy}
                onPick={(i) => void submitChosen(i)}
                classFor={() => "border-gold-dim bg-card"}
              />
            </>
          )}
          {error && <p className="text-center text-sm text-red">{error}</p>}
        </div>
      )}

      {/* ===== event: ฝนดาวตก (meteor) — คำถามโบนัสทั้งห้อง ===== */}
      {!cw && meteorActive && meteorEv && (
        <div className="quiz-question-card flex flex-col gap-4 !border-2 !border-gold">
          <div className="flex items-center justify-between gap-2">
            <span className="quiz-question-label text-xs">☄️ ฝนดาวตก · คนแรกที่ตอบถูกได้โบนัส</span>
            <span className="rounded-full bg-track px-2.5 py-0.5 text-xs font-bold tabular-nums text-text2">
              {meteorRemain} วิ
            </span>
          </div>

          {meteorResult ? (
            <div role="status" className="rounded-2xl border border-border bg-track/40 p-4 text-center">
              {meteorResult.won ? (
                <p className="font-sarabun text-xl font-bold text-gold-hi">
                  ตอบถูก! บอสเสียเลือด −{meteorResult.bonus_damage ?? 15}
                </p>
              ) : meteorResult.event_active === false ? (
                <p className="text-lg font-bold text-text2">อีเวนต์จบไปแล้ว</p>
              ) : meteorResult.is_correct === false ? (
                <p className="font-sarabun text-xl font-bold text-text2">ยังไม่ถูกนะ</p>
              ) : (
                <p className="text-lg font-bold text-text2">ตอบแล้ว รอผล</p>
              )}
              <p className="mt-2 text-xs text-text3">กำลังกลับสู่คำถามปกติ…</p>
            </div>
          ) : (
            <>
              <h2 className="whitespace-pre-wrap font-sarabun text-lg font-bold leading-relaxed text-text">
                {meteorEv.question_text}
              </h2>
              <ChoiceList
                choices={meteorEv.choices}
                disabled={meteorBusy}
                onPick={(i) => void submitMeteor(i)}
                classFor={() => "border-gold-dim bg-card"}
              />
            </>
          )}
          {error && <p className="text-center text-sm text-red">{error}</p>}
        </div>
      )}

      {/* ===== flow ปกติ (ซ่อนตอนมี event นักรบถูกเลือก / ฝนดาวตก) ===== */}
      {!cw && !meteorActive && (
        <>
          {phase === "loading" && (
            <div className="quiz-question-card py-10 text-center text-sm text-text3">กำลังโหลดคำถาม…</div>
          )}

          {phase === "ended" && (
            <div className="quiz-question-card py-10 text-center text-lg font-bold text-text2">เกมจบแล้ว</div>
          )}

          {phase === "cooldown" && (
            <div className="quiz-question-card py-8 text-center">
              <p className="text-4xl" aria-hidden>
                🌿
              </p>
              <p className="mt-2 text-lg font-bold text-gold-hi">พักหายใจสักครู่</p>
              <p className="mt-1 text-sm text-text2">ค่อย ๆ อ่านโจทย์รอบหน้านะ</p>
              <p className="mt-4 text-4xl font-extrabold tabular-nums text-text">{cooldownRemain}</p>
              <p className="text-xs text-text3">วินาที</p>
            </div>
          )}

          {phase === "error" && (
            <div className="quiz-question-card py-8 text-center">
              <p className="text-sm text-red">{error}</p>
              <button
                type="button"
                onClick={() => void loadQuestion()}
                className="mt-4 rounded-2xl border border-gold bg-amber px-5 py-3 text-sm font-bold text-on-amber transition active:scale-95"
              >
                ขอคำถามใหม่
              </button>
            </div>
          )}

          {(phase === "answering" || phase === "submitting" || phase === "result") && q && (
            <div className="quiz-question-card flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <span className="quiz-question-label text-xs">
                  ⚔️ Boss Raid · ข้อ {answered + (phase === "result" ? 0 : 1)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                    phase === "answering" && secsLeft <= 5 ? "bg-red/15 text-red" : "bg-track text-text2"
                  }`}
                >
                  {phase === "result" ? "—" : `${secsLeft} วิ`}
                </span>
              </div>
              <div className="-mt-1 h-2 w-full overflow-hidden rounded-full bg-track">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ease-linear ${timerTone}`}
                  style={{ width: `${phase === "result" ? 0 : timerPct}%` }}
                />
              </div>

              <h2 className="whitespace-pre-wrap font-sarabun text-lg font-bold leading-relaxed text-text sm:text-xl">
                {q.question_text}
              </h2>

              {q.image_url && <QuizQuestionImage key={q.question_id} src={q.image_url} />}

              <ChoiceList
                choices={q.choices}
                disabled={phase !== "answering"}
                onPick={(i) => void submit(i)}
                classFor={choiceClass}
                mark={(i) =>
                  picked === i && lastResultCorrect ? (
                    <span aria-label="ตอบถูก" className="text-correct-hi">
                      ✓
                    </span>
                  ) : picked === i && lastResultWrong ? (
                    <span aria-label="ยังไม่ถูก" className="text-red">
                      ×
                    </span>
                  ) : null
                }
              />

              {phase === "result" && result && (
                <div
                  role="status"
                  className={`rounded-2xl border p-4 text-center ${
                    result.is_correct
                      ? "border-correct/40 bg-correct/10 text-correct-text"
                      : "border-border bg-track/40 text-text"
                  }`}
                >
                  {result.is_correct ? (
                    <>
                      <p className="font-sarabun text-xl font-bold">
                        ตอบถูก! 🎉 {result.is_crit && <span className="text-amber">คริติคอล ✦</span>}
                      </p>
                      <p className="mt-1 text-2xl font-extrabold text-red">−{result.damage_dealt} HP</p>
                    </>
                  ) : (
                    <p className="font-sarabun text-xl font-bold">
                      {picked === null ? "หมดเวลา ไม่เป็นไร!" : "ยังไม่ถูกนะ ไม่เป็นไร!"}
                    </p>
                  )}
                  {result.combo_burst && (
                    <p className="mt-2 text-sm font-bold text-indigo-hi">🔥 พลังรวมพลัง! ทั้งห้อง −40 เพิ่ม</p>
                  )}
                  <p className="mt-2 text-xs text-text3">
                    {result.cooldown_until ? "พักหายใจแป๊บนึง…" : "กำลังไปข้อต่อไป…"}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ปุ่มตัวเลือกแบบหน้า /quiz: วงตัวอักษร ก ข ค ง + ข้อความ font-sarabun ตัวใหญ่ แตะง่ายบนมือถือ
function ChoiceList({
  choices,
  disabled,
  onPick,
  classFor,
  mark,
}: {
  choices: string[];
  disabled: boolean;
  onPick: (i: number) => void;
  classFor: (i: number) => string;
  mark?: (i: number) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {choices.map((c, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onPick(i)}
          className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left font-sarabun text-lg font-medium text-text shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed ${classFor(i)}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-track text-sm font-bold text-text2">
            {THAI_LETTERS[i] ?? i + 1}
          </span>
          <span className="min-w-0 flex-1 break-words">{c}</span>
          {mark?.(i)}
        </button>
      ))}
    </div>
  );
}
