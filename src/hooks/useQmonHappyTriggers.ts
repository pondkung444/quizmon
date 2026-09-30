"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { QmonSpriteHandle } from "@/components/QmonSprite";
import {
  DEFAULT_RANDOM_TUNING,
  FAST_RANDOM_TUNING,
  clearQuizHappy,
  getSessionStorage,
  readQuizHappy,
  shouldPlayRandomHappy,
} from "@/lib/qmonHappyTriggers";

// trigger ท่า Happy บนการ์ดหลัก: แตะ / สุ่มตอนจบรอบ Idle / กลับจาก quiz — รวมไว้ที่นี่ที่เดียว
// ทำงานเฉพาะเมื่อ sprite ใช้งานอยู่ (spriteActive) — ไม่งั้นทุก callback เป็น no-op
export function useQmonHappyTriggers({
  spriteRef,
  spriteKey,
  spriteActive,
  spriteReady,
  justEvolved,
  fastRandom,
  forceQuizHappy,
}: {
  spriteRef: RefObject<QmonSpriteHandle | null>;
  spriteKey: string | null;
  spriteActive: boolean;
  spriteReady: boolean; // Idle วาดเฟรมแรกแล้ว
  justEvolved: boolean;
  fastRandom: boolean;
  forceQuizHappy: boolean; // ?animQuizHappy=1 (ไม่ใช่ production): ทำเหมือนมี key กลับจาก quiz
}) {
  const tuning = fastRandom ? FAST_RANDOM_TUNING : DEFAULT_RANDOM_TUNING;
  const tuningRef = useRef(tuning);
  const mountedAtRef = useRef(0);
  const lastEndRef = useRef<number | null>(null);
  const queuedRef = useRef(false); // มี Happy จากการสุ่มรอเล่นอยู่
  const [happyReadyKey, setHappyReadyKey] = useState<string | null>(null); // key ของ sprite ที่ sheet Happy พร้อมแล้ว
  const quizHandledRef = useRef(false);

  useEffect(() => {
    tuningRef.current = tuning;
  });
  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);
  // เปลี่ยน sprite (key ใหม่) → เคลียร์คิวสุ่มที่ค้าง
  useEffect(() => {
    queuedRef.current = false;
  }, [spriteKey]);

  const onTap = useCallback(() => {
    spriteRef.current?.playHappy();
  }, [spriteRef]);

  const onIdleLoop = useCallback(() => {
    const ok = shouldPlayRandomHappy(
      {
        now: Date.now(),
        mountedAt: mountedAtRef.current,
        lastHappyEndAt: lastEndRef.current,
        hidden: document.hidden,
        queued: queuedRef.current,
      },
      tuningRef.current,
      Math.random(),
    );
    if (ok && spriteRef.current?.playHappy({ atLoopEnd: true })) queuedRef.current = true;
  }, [spriteRef]);

  const onHappyEnd = useCallback(() => {
    queuedRef.current = false;
    lastEndRef.current = Date.now(); // cooldown นับใหม่ทุกครั้งที่ Happy จบ ไม่ว่า trigger ไหน
  }, []);

  const onHappyReady = useCallback(() => setHappyReadyKey(spriteKey), [setHappyReadyKey, spriteKey]);

  // กลับจาก quiz: เล่น Happy 1 ครั้งเมื่อ Idle วาดแล้ว + sheet Happy พร้อม · ลบ key ทิ้งทุกกรณีที่เล่นไม่ได้
  useEffect(() => {
    if (quizHandledRef.current) return;
    const storage = getSessionStorage();
    const status = forceQuizHappy ? "fresh" : readQuizHappy(storage, Date.now());
    if (status === "none") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (status === "stale" || justEvolved || !spriteActive || reduced) {
      quizHandledRef.current = true;
      clearQuizHappy(storage);
      return;
    }
    if (!spriteReady || happyReadyKey !== spriteKey) return; // รอ deps เปลี่ยนแล้วลองใหม่
    if (spriteRef.current?.playHappy()) {
      quizHandledRef.current = true;
      clearQuizHappy(storage);
    }
  }, [forceQuizHappy, justEvolved, spriteActive, spriteReady, happyReadyKey, spriteKey, spriteRef]);

  return { onTap, onIdleLoop, onHappyEnd, onHappyReady };
}
