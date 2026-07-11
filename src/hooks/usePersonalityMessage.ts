"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMessage, type PersonalityKey } from "@/lib/personality";
import type { PersonalityEventKey } from "@/lib/personalityMessages";

// ---- ค่าตั้งเวลา/ความน่าจะเป็น ปรับได้ตรงนี้จุดเดียว ----
const IDLE_TIMEOUT_MS = 20_000; // ไม่มีปฏิสัมพันธ์เกินเท่านี้ -> โชว์ข้อความชุด idle
const RANDOM_CHECK_MIN_MS = 30_000; // สุ่มเช็คข้อความชุด random ทุก 30-60 วิ
const RANDOM_CHECK_MAX_MS = 60_000;
const RANDOM_CHANCE = 0.1; // โอกาสโชว์ข้อความ random ต่อครั้งที่เช็ค (~10%)
// ข้อความค้างจอกี่ ms ก่อนหาย — export ไว้ให้ผู้เรียกที่ต้องคิว event หลายตัว (เช่น QuizClient)
// เว้นจังหวะห่างกันเท่ากับตัวเลขนี้ กันข้อความทับกัน
export const MESSAGE_DISPLAY_MS = 4_000;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function usePersonalityMessage(personality: PersonalityKey) {
  const [message, setMessage] = useState<string | null>(null);

  // true = กำลังมีข้อความ (สำคัญ/idle/random) โชว์อยู่ กัน idle/random ทับกัน
  const activeRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const randomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback(
    (event: PersonalityEventKey) => {
      const text = getMessage(event, personality);
      if (!text) return false;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      activeRef.current = true;
      setMessage(text);
      hideTimerRef.current = setTimeout(() => {
        setMessage(null);
        activeRef.current = false;
      }, MESSAGE_DISPLAY_MS);
      return true;
    },
    [personality]
  );

  // นับถอยหลัง IDLE_TIMEOUT_MS ใหม่ทุกครั้งที่มีปฏิสัมพันธ์ (ไม่ใช่ poll เป็นรอบคงที่)
  // ถ้ายัง idle อยู่ตอนครบเวลา โชว์ข้อความแล้วรีสตาร์ทนับใหม่ต่อเนื่อง
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(function tick() {
      if (!activeRef.current) showMessage("idle");
      idleTimerRef.current = setTimeout(tick, IDLE_TIMEOUT_MS);
    }, IDLE_TIMEOUT_MS);
  }, [showMessage]);

  // เรียกตอนมีปฏิสัมพันธ์สำคัญ (เช่น แตะตัวสัตว์) — โชว์ข้อความทันทีและรีเซ็ตนาฬิกา idle
  const triggerEvent = useCallback(
    (event: PersonalityEventKey) => {
      resetIdleTimer();
      showMessage(event);
    },
    [showMessage, resetIdleTimer]
  );

  // เรียกตอนมีปฏิสัมพันธ์ทั่วไปที่ไม่ต้องโชว์ข้อความ แค่รีเซ็ตนาฬิกา idle
  const notifyInteraction = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    function tick() {
      if (!activeRef.current && Math.random() < RANDOM_CHANCE) {
        showMessage("random");
      }
      randomTimerRef.current = setTimeout(tick, randomBetween(RANDOM_CHECK_MIN_MS, RANDOM_CHECK_MAX_MS));
    }
    randomTimerRef.current = setTimeout(tick, randomBetween(RANDOM_CHECK_MIN_MS, RANDOM_CHECK_MAX_MS));
    return () => {
      if (randomTimerRef.current) clearTimeout(randomTimerRef.current);
    };
  }, [showMessage]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return { message, triggerEvent, notifyInteraction };
}
