"use client";

import { useState } from "react";

// Team Battle — นาฬิกาเซิร์ฟเวอร์ฝั่ง client
// offset = server_now − จุดกึ่งกลางของ (t0, t1) ของคำขอนั้น; เก็บตัวอย่างล่าสุด ~5 ครั้ง
// แล้วเลือกตัวอย่างที่ RTT ต่ำสุด (เชื่อถือได้สุด) — ใช้นับถอยหลังจาก round_deadline ของ DB
// ห้ามใช้ config.answer_seconds นับเวลาเอง (เอฟเฟกต์ haste ลดเวลาลงครึ่งหนึ่ง)

export type ClockSample = { t0: number; t1: number; serverNow: string | number };

export type ClockEstimator = {
  /** ป้อนตัวอย่างจากคำขอหนึ่ง: t0/t1 = Date.now() ก่อน/หลังเรียก, serverNow = ค่า server_now ที่ได้กลับมา */
  recordSample: (s: ClockSample) => void;
  /** เวลาเซิร์ฟเวอร์ ณ ตอนนี้ (ms); `now` ไว้ให้เทสควบคุมนาฬิกาเครื่อง */
  serverNow: (now?: number) => number;
  /** ms ที่เหลือจนถึง deadline (ISO) ตามเวลาเซิร์ฟเวอร์ — ติดลบ = เลยเวลาแล้ว; deadline ว่าง = Infinity */
  msUntil: (deadlineIso: string | null | undefined, now?: number) => number;
  /** offset ปัจจุบัน (ms) — 0 ถ้ายังไม่มีตัวอย่าง */
  offsetMs: () => number;
  sampleCount: () => number;
};

export const CLOCK_MAX_SAMPLES = 5;

export function createClockEstimator(maxSamples = CLOCK_MAX_SAMPLES): ClockEstimator {
  let samples: { rtt: number; offset: number }[] = [];
  let best = 0;

  const offsetMs = () => best;
  const serverNow = (now: number = Date.now()) => now + best;

  return {
    recordSample({ t0, t1, serverNow: sn }) {
      const server = typeof sn === "number" ? sn : Date.parse(sn);
      if (!Number.isFinite(server) || !Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return;
      samples = [...samples, { rtt: t1 - t0, offset: server - (t0 + t1) / 2 }].slice(-maxSamples);
      best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
    },
    serverNow,
    msUntil(deadlineIso, now = Date.now()) {
      if (!deadlineIso) return Infinity;
      const d = Date.parse(deadlineIso);
      if (!Number.isFinite(d)) return Infinity;
      return d - serverNow(now);
    },
    offsetMs,
    sampleCount: () => samples.length,
  };
}

/** instance เดียวต่อ component (ไม่ trigger re-render — อ่านค่าตอนต้องการผ่าน serverNow()/msUntil()) */
export function useServerClock(): ClockEstimator {
  const [clock] = useState(() => createClockEstimator());
  return clock;
}
