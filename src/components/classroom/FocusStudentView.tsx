"use client";

import { formatElapsed, useElapsedSeconds } from "@/lib/classroom/useFocusSession";

// หน้าจอนักเรียนระหว่างคาบตั้งใจ (Phase 1: แบบเรียบ — overlay/ตัวการ์ตูนอ่านหนังสือเป็นของ Phase 2)
export default function FocusStudentView({
  startedAt,
  connected,
}: {
  startedAt: string;
  connected: boolean;
}) {
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <main className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg px-6 text-center">
      <h1 className="text-3xl font-bold text-gold-hi">คาบตั้งใจ</h1>
      <p className="mt-3 max-w-xs text-text2">
        วางมือถือราบหน้าจอขึ้น แล้วตั้งใจทำงานของตัวเองนะ
      </p>
      <p className="mt-8 font-mono text-5xl text-gold-hi">{formatElapsed(elapsed)}</p>
      <p className="mt-8 text-xs text-text3">{connected ? "🟢 เชื่อมต่อสด" : "กำลังเชื่อมต่อ…"}</p>
    </main>
  );
}
