"use client";

import { useState } from "react";

export default function QuizJourney({ completed, total, avatar }: { completed: number; total: number; avatar: string | null }) {
  const [failed, setFailed] = useState(false);
  const count = Math.max(1, total);
  const position = Math.min(count, Math.max(0, completed));
  return (
    <section className="quiz-journey" aria-label={`เดินทางแล้ว ${position} จาก ${count} จุด`}>
      <div className="flex items-center justify-between gap-3 text-xs text-emerald-100">
        <span className="font-medium">เดินทางไปด้วยกัน</span>
        <span>{position === count ? "ถึงปลายทางแล้ว!" : `ผ่านแล้ว ${position}/${count} จุด`}</span>
      </div>
      <div className="quiz-route" aria-hidden="true">
        <div className="quiz-route-line" />
        <div className="quiz-route-fill" style={{ width: `${position / count * 100}%` }} />
        {Array.from({ length: count + 1 }, (_, step) => (
          <span key={step} className={`quiz-route-point ${step <= position ? "is-complete" : ""}`} style={{ left: `${step / count * 100}%` }}>
            {step === count ? "⚑" : step === 0 ? "•" : step <= position ? "✓" : step}
          </span>
        ))}
        <div className="quiz-traveler" style={{ left: `${position / count * 100}%` }}>
          {avatar && !failed ? (
            // Static transparent art stays intact; no sprite sheet or native dependency.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" onError={() => setFailed(true)} />
          ) : <span className="text-3xl">🐾</span>}
        </div>
      </div>
    </section>
  );
}
