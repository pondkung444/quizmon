"use client";

import { formatElapsed, useElapsedSeconds } from "@/lib/classroom/useFocusSession";

// แผงครูระหว่างคาบตั้งใจ — โชว์จำนวนรวมเท่านั้น ไม่โชว์ชื่อ/ผลรายคน
export default function FocusTeacherPanel({
  startedAt,
  participantCount,
  pending,
  onStop,
}: {
  startedAt: string;
  participantCount: number;
  pending: boolean;
  onStop: () => void;
}) {
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <div className="mt-4 rounded-2xl border border-gold-dim bg-card p-4 text-center">
      <p className="text-sm text-text2">กำลังคาบตั้งใจ</p>
      <p className="mt-1 font-mono text-4xl text-gold-hi">{formatElapsed(elapsed)}</p>
      <p className="mt-2 text-sm text-text2">นักเรียนในคาบ: {participantCount} คน</p>
      <button
        type="button"
        disabled={pending}
        onClick={onStop}
        className="mt-4 w-full rounded-xl border border-gold bg-amber px-4 py-3 font-bold text-on-amber transition active:scale-95 disabled:opacity-50"
      >
        {pending ? "กำลังหยุด…" : "หยุดคาบตั้งใจ"}
      </button>
    </div>
  );
}
