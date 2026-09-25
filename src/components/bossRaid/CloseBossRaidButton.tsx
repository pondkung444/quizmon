"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeBossRaid } from "@/app/boss-raid/actions";

// ปุ่ม "ปิด Boss Raid" ของครู — ใช้ทั้งหน้าควบคุม (/boss-raid/[id]) และจอ TV
// เกมยังไม่จบ = ถามยืนยันก่อน (จบเกมทันที + นักเรียนเห็นสรุปผล); จบแล้ว = ปิดได้เลย
// สำเร็จแล้วพากลับห้องเรียนที่เปิด Raid นี้ (หรือหน้าแรกครูถ้าไม่ได้เปิดจากห้องเรียน)
export default function CloseBossRaidButton({
  sessionId,
  gameRunning,
  label,
  className,
  tone = "app",
}: {
  sessionId: string;
  /** ยังไม่จบ (lobby / in_progress) — ต้องยืนยันก่อน */
  gameRunning: boolean;
  label: string;
  className: string;
  /** "tv" = ข้อความขาวบนพื้นมืดของจอ TV */
  tone?: "app" | "tv";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    start(async () => {
      setError(null);
      try {
        const { classroomSessionId } = await closeBossRaid(sessionId);
        router.push(classroomSessionId ? `/teacher/${classroomSessionId}` : "/teacher");
      } catch (e) {
        setError(e instanceof Error ? e.message : "ปิดไม่สำเร็จ");
        setConfirming(false);
      }
    });
  }

  const hint = tone === "tv" ? "text-white/80" : "text-text2";

  if (confirming) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className={`text-center text-sm ${hint}`}>เกมยังไม่จบ — ปิดเลยไหม? นักเรียนจะเห็นสรุปผลทันที</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="rounded-xl border border-border bg-track px-4 py-2 text-sm font-bold text-text2 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={close}
            className="rounded-xl border border-red bg-red px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {pending ? "กำลังปิด…" : "ปิดเลย"}
          </button>
        </div>
        {error && <p className="text-center text-xs text-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => (gameRunning ? setConfirming(true) : close())}
        className={`${className} disabled:opacity-50`}
      >
        {pending ? "กำลังปิด…" : label}
      </button>
      {error && <p className="text-center text-xs text-red">{error}</p>}
    </div>
  );
}
