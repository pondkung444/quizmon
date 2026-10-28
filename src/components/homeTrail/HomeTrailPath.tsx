"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Egg, Flag, Lock, Map as MapIcon, Star, Swords, Users, Warehouse } from "lucide-react";
import type { TrailStop, TrailStopId, TrailStopStatus } from "@/lib/homeTrail";
import { keepTogether } from "@/components/homeTrail/keepTogether";

const STOP_ICON: Record<TrailStopId, ReactNode> = {
  hatch: <Egg strokeWidth={2.2} />,
  collect: <Warehouse strokeWidth={2.2} />,
  mission: <Flag strokeWidth={2.2} />,
  train: <Star strokeWidth={2.2} />,
  adventure: <MapIcon strokeWidth={2.2} />,
  raid: <Swords strokeWidth={2.2} />,
  pvp: <Users strokeWidth={2.2} />,
};

const STATUS_LABEL: Record<TrailStopStatus, string> = { done: " · ทำแล้ว", locked: " · ยังล็อก", now: " · ตอนนี้", todo: "", wait: "" };

// ทางเดิน: จุด + เส้นโค้ง SVG — ตำแหน่งเส้นคำนวณจาก element จริง ([data-trail-anchor]) ใหม่ทุกครั้งที่กล่องเปลี่ยนขนาด
// nowSlot = การ์ด "ตอนนี้" ที่วางแทนจุดปัจจุบัน (มือถือตั้ง) — ไม่ส่ง = จุดปัจจุบันเป็นวงสีพร้อมป้าย "ตอนนี้"
// จอเตี้ยแนวนอน/จอกว้าง: nowSlot ถูกซ่อนด้วย CSS (.ht-vis-portrait) แล้วจุดปัจจุบันแบบวงสีโผล่แทน (.ht-vis-two)
// — render ทั้งคู่ ไม่ใช้ JS ตัดสินตามจอ (กันกระพริบตอน hydrate) · เส้นตรงในจอเตี้ยมาจาก CSS (.ht-stop.r)
// แต่ละจุดเป็นปุ่มทั้งแถว (ทางลัดรอง) — กดแล้วทำอะไรตัดสินที่ resolveStopTap() ผ่าน onTap · note = ข้อความสั้นใต้แถว (จุดล็อก)
export default function HomeTrailPath({
  stops,
  nowSlot,
  justDone,
  note,
  onTap,
  renderCollect,
}: {
  stops: TrailStop[];
  nowSlot: ReactNode | null;
  justDone: ReadonlySet<TrailStopId>;
  note: { id: TrailStopId; message: string } | null;
  onTap: (stop: TrailStop, collect?: () => void) => void;
  // จุด "เก็บเข้าฟาร์ม" ต้องอยู่ใน CollectPetButton เพื่อใช้ handler เดียวกับปุ่มหลัก
  renderCollect: (row: (onCollect?: () => void) => ReactNode) => ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLParagraphElement>(null);

  // ข้อความล็อกต้องอยู่ในจอเสมอหลังกด (จอเตี้ยแนวนอนมันเคยขึ้นใต้ขอบจอ) — เลื่อนเท่าที่จำเป็น, ปิด motion = ไม่ smooth
  useEffect(() => {
    if (!note) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    noteRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [note]);
  const [segments, setSegments] = useState<{ d: string; done: boolean }[]>([]);

  const draw = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const origin = box.getBoundingClientRect();
    // ข้ามจุดที่ถูกซ่อนด้วย CSS ตามขนาดจอ (offsetParent = null)
    const points = [...box.querySelectorAll<HTMLElement>("[data-trail-anchor]")].filter((el) => el.offsetParent !== null).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2, done: el.dataset.trailAnchor === "done" };
    });
    const next: { d: string; done: boolean }[] = [];
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1];
      const q = points[i];
      const dy = (q.y - p.y) * 0.95;
      next.push({ d: `M${p.x} ${p.y} C ${p.x} ${p.y + dy}, ${q.x} ${q.y - dy}, ${q.x} ${q.y}`, done: p.done });
    }
    setSegments(next);
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(box);
    document.fonts?.ready.then(draw).catch(() => {});
    return () => ro.disconnect();
  }, [draw, stops, nowSlot]);

  return (
    <div className="ht-trail" ref={boxRef}>
      <svg className="ht-line" aria-hidden>
        {segments.map((s, i) => (
          <path key={i} className={s.done ? "p-done" : "p-todo"} d={s.d} />
        ))}
      </svg>
      <ol className="ht-stops">
        {stops.map((s, i) => {
          const inlineCard = s.status === "now" && nowSlot;
          const side = i % 2 ? "r" : "";
          const cls = { done: "done", locked: "locked", now: "here", todo: "", wait: "" }[s.status];
          const icon = s.status === "done" ? <Check strokeWidth={2.6} /> : s.status === "locked" ? <Lock strokeWidth={2.2} /> : STOP_ICON[s.id];
          const row = (onCollect?: () => void) => (
            <button
              type="button"
              className={`ht-stop ${side} ${cls} ${justDone.has(s.id) ? "just-done" : ""} ${inlineCard ? "ht-vis-two" : ""}`}
              aria-label={`${s.title} · ${s.detail}${STATUS_LABEL[s.status]}`}
              onClick={() => onTap(s, onCollect)}
            >
              <span className="ht-dot" data-trail-anchor={s.status === "done" ? "done" : "todo"} aria-hidden>
                {icon}
              </span>
              <span className="ht-txt" aria-hidden>
                <span className="ht-t">{s.title}</span>
                <span className="ht-d">{keepTogether(s.detail)}</span>
                {s.status === "now" && <span className="ht-pill">ตอนนี้</span>}
              </span>
            </button>
          );
          return (
            <li key={s.id} data-stop={s.id}>
              {inlineCard && <div className="ht-vis-portrait">{nowSlot}</div>}
              {s.id === "collect" ? renderCollect(row) : row()}
              {note?.id === s.id && (
                <p ref={noteRef} className={`ht-note ${side} ${inlineCard ? "ht-vis-two" : ""}`} role="status">
                  {note.message}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
