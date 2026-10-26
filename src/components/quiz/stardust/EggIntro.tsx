"use client";

import { useEffect, useRef, useState } from "react";
import { STARDUST_TEXT } from "@/lib/stardust";
import { STAR_PATH } from "@/components/quiz/stardust/StarShape";

const DUST: [number, number][] = [[-20, 30], [190, 50], [10, 170], [180, 160], [90, -18]];

// ฉากเปิด 2 จังหวะ ก่อนข้อแรกของรอบแรกสุดของไข่ — ปิดแล้วไม่ขึ้นอีกในรอบนั้น (คนเรียกคุมผ่าน onDone)
export default function EggIntro({ img, gradientId, onDone }: { img: string | null; gradientId: string; onDone: () => void }) {
  const [beat, setBeat] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const b = STARDUST_TEXT.intro[beat];

  useEffect(() => {
    btnRef.current?.focus({ preventScroll: true });
  }, [beat]);

  return (
    <div className="sd-intro" role="dialog" aria-modal="true" aria-label={b.t}>
      <div className="sd-egg-big">
        <svg className="sd-dust" viewBox="-30 -30 230 250" aria-hidden focusable="false">
          {DUST.map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${0.5 + (i % 3) * 0.2})`}>
              <path d={STAR_PATH} fill={`url(#${gradientId})`} />
            </g>
          ))}
        </svg>
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={STARDUST_TEXT.eggName} />
        )}
      </div>
      <div key={beat} className="sd-beat">
        <p className="sd-intro-t">{b.t}</p>
        <p className="sd-intro-s">{b.s}</p>
      </div>
      <button
        ref={btnRef}
        type="button"
        className="sd-btn"
        onClick={() => (beat + 1 < STARDUST_TEXT.intro.length ? setBeat(beat + 1) : onDone())}
      >
        {b.b}
      </button>
    </div>
  );
}
