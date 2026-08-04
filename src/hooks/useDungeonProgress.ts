"use client";

import { useEffect, useState } from "react";

export type DungeonProgress = {
  percent: number; // 0-100, clamp แล้ว
  remainingMs: number; // clamp ที่ 0 ไม่ติดลบ
  isClaimable: boolean;
};

function computeProgress(startedAt: string, endsAt: string): DungeonProgress {
  const start = new Date(startedAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const total = end - start;
  const elapsed = now - start;
  const percent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100;
  const remainingMs = Math.max(0, end - now);
  return { percent, remainingMs, isClaimable: now >= end };
}

// ตำแหน่ง/เวลาที่เหลือของการผจญภัย — คำนวณจาก timestamp ทุก 1 วินาทีฝั่ง client ล้วนๆ ไม่ poll
// server ถี่ (sync กับ server แค่ตอนโหลดหน้าผ่าน startedAt/endsAt ที่รับมาเป็น prop)
//
// ⚠️ ห้ามใช้ Date.now() ใน useState initializer ตรงๆ — component นี้ SSR ด้วย (client component
// แต่ render รอบแรกฝั่ง server) เวลา server render กับเวลา client hydrate ต่างกันไม่กี่ ms ทำให้ค่า
// percent/left ที่ได้ต่างกันเล็กน้อย เกิด hydration mismatch (พบจริงตอนทดสอบ 2026-08-04) เริ่มจากค่า
// static คงที่ก่อนเสมอ แล้วให้ useEffect (client-only) ตั้งค่าจริงทันทีหลัง mount แทน
export function useDungeonProgress(startedAt: string, endsAt: string): DungeonProgress {
  const [progress, setProgress] = useState<DungeonProgress>({
    percent: 0,
    remainingMs: 0,
    isClaimable: false,
  });

  useEffect(() => {
    setProgress(computeProgress(startedAt, endsAt));
    const interval = setInterval(() => {
      setProgress(computeProgress(startedAt, endsAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, endsAt]);

  return progress;
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
