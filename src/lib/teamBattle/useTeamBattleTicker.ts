"use client";

import { useEffect, useRef, useState } from "react";
import { viewerRpc } from "./rpc";
import type { BattlePhase, BattleStatus } from "./types";
import type { ClockEstimator } from "./useServerClock";

// Team Battle — ใครยิง tb_tick (ปิดยกที่หมดเวลา)
//   host    (จอครู)     : deadline + 300 ms
//   student (มือถือสำรอง): deadline + jitter 1000–3000 ms (กันทั้งห้องยิงพร้อมกัน — RPC ล็อกแถว battle ต่อครั้ง)
// DB ตัดสินด้วย now() ของตัวเองและ idempotent — client แค่ "เคาะ" ไม่ใช่ตัวตัดสินเวลา
//   - กันยิงซ้ำด้วย key (round_no, phase): สำเร็จแล้วไม่ยิงอีก
//   - action 'wait' (นาฬิกา client เร็วกว่า DB เล็กน้อย) หรือ tb_tick throw (เน็ตสะดุด ฯลฯ)
//     → ลองใหม่ทุก 1.5 วิ รวมกันไม่เกิน 3 ครั้ง; ครบแล้วยังไม่สำเร็จ = หยุดยิง (ไม่ mark done)
//     แล้วพึ่ง refetch/resync พาไปสถานะล่าสุด (ยิงใหม่เมื่อ deadline/phase/round เปลี่ยน หรือกลับมา visible)
//   - ทุกครั้งที่ยิง (สำเร็จ/wait/throw) สั่ง refetch; หยุดเมื่อ status != 'active'
//   - แท็บ hidden = ไม่ยิง; ตอนกลับมา visible ตัดสินใหม่จาก deadline ปัจจุบัน

export type TickerMode = "host" | "student";

export const HOST_DELAY_MS = 300;
export const STUDENT_JITTER_MIN_MS = 1000;
export const STUDENT_JITTER_SPAN_MS = 2000;
export const WAIT_RETRY_MS = 1500;
export const WAIT_RETRY_MAX = 3;

type TickerInput = {
  battleId: string;
  mode: TickerMode;
  status: BattleStatus | undefined;
  phase: BattlePhase | null | undefined;
  currentRound: number | undefined;
  roundDeadline: string | null | undefined;
  clock: ClockEstimator;
  refetch: () => Promise<void>;
  enabled?: boolean;
  onError?: (err: unknown) => void;
};

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function useTeamBattleTicker({
  battleId,
  mode,
  status,
  phase,
  currentRound,
  roundDeadline,
  clock,
  refetch,
  enabled = true,
  onError,
}: TickerInput) {
  const [visible, setVisible] = useState(isVisible);
  const doneRef = useRef<Set<string>>(new Set());
  const refetchRef = useRef(refetch);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    refetchRef.current = refetch;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const onVis = () => setVisible(isVisible());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!enabled || !visible || status !== "active" || !roundDeadline || !phase || currentRound === undefined) return;
    const key = `${battleId}:${currentRound}:${phase}`;
    if (doneRef.current.has(key)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const fire = async () => {
      if (cancelled) return;
      let retry = false;
      try {
        const res = await viewerRpc.tick(battleId);
        if (cancelled) return;
        retry = res.action === "wait";
        if (!retry) doneRef.current.add(key);
      } catch (e) {
        if (cancelled) return;
        onErrorRef.current?.(e);
        retry = true;
      }
      void refetchRef.current();
      if (retry && attempts < WAIT_RETRY_MAX) {
        attempts += 1;
        timer = setTimeout(() => void fire(), WAIT_RETRY_MS);
      }
    };

    const base = clock.msUntil(roundDeadline);
    const extra =
      mode === "host" ? HOST_DELAY_MS : STUDENT_JITTER_MIN_MS + Math.random() * STUDENT_JITTER_SPAN_MS;
    timer = setTimeout(() => void fire(), Math.max(0, base) + extra);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [battleId, mode, status, phase, currentRound, roundDeadline, clock, enabled, visible]);
}
