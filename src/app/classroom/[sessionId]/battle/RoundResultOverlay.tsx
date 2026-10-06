"use client";

import { narrateRound } from "@/lib/teamBattle/central";
import { STUDENT_TEXT } from "@/lib/teamBattle/student";
import type { RoundResult } from "@/lib/teamBattle/types";
import styles from "./battle.module.css";

// แผ่นผลยกด้านล่าง ~3.5 วิหลังปิดยก — ติดขอบล่างและไม่บังมือการ์ดของผู้บัญชาการยกถัดไป
// (ยกใหม่เริ่มนับเวลาแล้ว) แตะปิดได้; มีเฉพาะตัวเลขรวม + ข้อความของตัวเอง (feedback) ไม่มีชื่อใคร ไม่มีเฉลย
export default function RoundResultOverlay({
  round,
  feedback,
  onClose,
}: {
  round: RoundResult;
  feedback: string | null;
  onClose: () => void;
}) {
  const n = narrateRound(round);
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 ${styles.sheetIn}`}
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      data-testid="round-overlay"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-gold-dim bg-card p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="font-bold text-gold-hi">{n.headline}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={STUDENT_TEXT.closeResult}
            className="min-h-12 min-w-12 -mr-2 -mt-2 rounded-xl text-text3 active:scale-95"
          >
            {STUDENT_TEXT.closeResult}
          </button>
        </div>
        {feedback && <p className="mt-1 text-lg font-bold text-text">{feedback}</p>}
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-track" aria-hidden>
          <div className="bg-good" style={{ width: `${n.split.correct}%` }} />
          <div className="bg-warn" style={{ width: `${n.split.wrong}%` }} />
          <div className="bg-text3" style={{ width: `${n.split.none}%` }} />
        </div>
        <ul className="mt-2 space-y-0.5">
          {n.lines.map((l) => (
            <li key={l} className="text-sm text-text2">
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
