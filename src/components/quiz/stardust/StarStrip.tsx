"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { LinkState, StarState } from "@/lib/stardust";
import { STARDUST_TEXT } from "@/lib/stardust";
import { EggCracks, STAR_PATH } from "@/components/quiz/stardust/StarShape";

// แถบบน: (ที่ว่างให้ปุ่ม BGM เดิมของ page.tsx ที่ fixed ซ้ายบน) · ดาว + เส้น · ปุ่ม ✕
// ตำแหน่งดาวคำนวณจากความกว้างจริงด้วย ResizeObserver (เส้น SVG ใช้ px เดียวกัน)
// popIndex = ดาวที่เพิ่งลง (เด้ง + เส้นลาก + น้องกระโดด) — เปลี่ยนค่า = เล่น animation ใหม่ผ่าน key
export default function StarStrip({
  stars,
  links,
  travelerAt,
  popIndex,
  isEgg,
  img,
  cracks,
  gradientId,
  ariaLabel,
  onExit,
}: {
  stars: StarState[];
  links: LinkState[];
  travelerAt: number;
  popIndex: number | null;
  isEgg: boolean;
  img: string | null;
  cracks: number;
  gradientId: string;
  ariaLabel: string;
  onExit: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const measure = useCallback(() => {
    if (boxRef.current) setW(boxRef.current.clientWidth);
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [measure]);

  const n = stars.length;
  const pad = 16;
  // ก่อนวัดได้ใช้ % (SSR/เฟรมแรก) — ไม่มีเส้นจนกว่าจะรู้ความกว้าง
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const px = (i: number) => (n <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (n - 1));
  const left = (i: number) => (w > 0 ? `${px(i)}px` : `${x(i)}%`);
  const y = 58 - 15;

  return (
    <header className="sd-top">
      <span className="sd-top-gap" aria-hidden />
      <div className="sd-strip" ref={boxRef} role="img" aria-label={ariaLabel}>
        {w > 0 && (
          <svg className="sd-links" aria-hidden focusable="false">
            {links.map((s, i) => {
              const x1 = px(i);
              const x2 = px(i + 1);
              const draw = s === "lit" && popIndex === i + 1;
              return (
                <line
                  key={draw ? `d${i}` : i}
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  className={`sd-seg ${s}${draw ? " sd-draw" : ""}`}
                  pathLength={s === "lit" ? 1 : undefined}
                />
              );
            })}
          </svg>
        )}
        {stars.map((s, i) => (
          <span
            key={popIndex === i ? `p${i}` : i}
            className={`sd-node ${s}${popIndex === i ? " sd-pop" : ""}`}
            style={{ left: left(i) }}
            data-star-index={i}
          >
            <svg viewBox="-12 -12 24 24" aria-hidden focusable="false">
              <path className="sd-shape" d={STAR_PATH} style={s === "lit" ? { fill: `url(#${gradientId})` } : undefined} />
            </svg>
          </span>
        ))}
        {img && !imgFailed && (
          <span
            key={popIndex !== null ? `t${popIndex}` : "t"}
            className={`sd-traveler${isEgg ? " egg" : ""}${popIndex !== null ? " sd-hop" : ""}`}
            style={{ left: left(Math.min(Math.max(0, travelerAt), n - 1)) }}
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" onError={() => setImgFailed(true)} />
            {isEgg && <EggCracks n={cracks} className="sd-cracks" />}
          </span>
        )}
      </div>
      <button type="button" className="sd-icon-btn" onClick={onExit} aria-label={STARDUST_TEXT.exit}>
        <X strokeWidth={2.4} aria-hidden />
      </button>
    </header>
  );
}
