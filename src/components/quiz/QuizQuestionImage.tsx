"use client";

import { useState } from "react";

export default function QuizQuestionImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Inline enlargement preserves native Android Back and page scrolling; no overlay
  // or history entry is needed. The image can be panned inside its own container.
  return (
    <figure className="quiz-image">
      {failed ? <div role="alert" className="p-5 text-center text-sm text-slate-800">
        <p>รูปโจทย์โหลดไม่สำเร็จ ลองโหลดรูปก่อนตอบนะ</p>
        <button type="button" className="mt-2 min-h-11 rounded-xl border border-slate-400 px-4" onClick={() => { setFailed(false); setLoaded(false); setAttempt(n => n + 1); }}>โหลดรูปอีกครั้ง</button>
      </div> : <>
        {!loaded && <p role="status" className="p-4 text-center text-sm text-slate-600">กำลังโหลดรูปโจทย์…</p>}
        <div className="overflow-auto" style={{ maxHeight: expanded ? "65svh" : undefined }} tabIndex={expanded ? 0 : undefined} aria-label={expanded ? "รูปขยาย เลื่อนเพื่อดูรายละเอียด" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={attempt} src={src} alt="รูปประกอบโจทย์" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={expanded ? "quiz-image-expanded" : "quiz-image-fit"} />
        </div>
        {loaded && <figcaption><button type="button" aria-expanded={expanded} onClick={() => setExpanded(v => !v)} className="min-h-11 w-full border-t border-slate-200 px-3 text-sm font-medium text-slate-700">{expanded ? "ย่อรูปกลับ · เลื่อนรูปเพื่อดูรายละเอียด" : "⊕ ขยายรูปโจทย์"}</button></figcaption>}
      </>}
    </figure>
  );
}
