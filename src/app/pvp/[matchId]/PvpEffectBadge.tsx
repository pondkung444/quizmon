"use client";

import { pvpEffectMeta, type PvpEffectId } from "@/lib/pvp/effects";

// ไอคอนต่อเอฟเฟกต์ (path อ้างอิง mockup: doc/pvp-slice2-handoff §5.1)
const ICON_PATH: Record<PvpEffectId, React.ReactNode> = {
  reprisal: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5" />
      <path d="M17 4v4h-4M7 20v-4h4" />
    </>
  ),
  pierce: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M8 12l8-6M8 12l8 6" />
    </>
  ),
  heal: (
    <>
      <path d="M12 20s-7-4.4-7-10a4.5 4.5 0 0 1 7-3.7A4.5 4.5 0 0 1 19 10c0 5.6-7 10-7 10z" />
      <path d="M12 8v5M9.5 10.5h5" />
    </>
  ),
  high_stake: <path d="M12 3s4 3.5 4 8a4 4 0 0 1-8 0c0-1.2.6-2 1.2-2.8.3.9 1 1.3 1.5.9-.4-1.8.3-3.6 1.3-6.1z" />,
  lifesteal: (
    <path d="M12 21c-4-3.6-7-6.6-7-10.2A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 7 4.8c0 3.6-3 6.6-7 10.2z" />
  ),
  haste: (
    <path d="M6 3h12M6 21h12M7 3c0 5 5 5 5 9s-5 4-5 9M17 3c0 5-5 5-5 9s5 4 5 9" />
  ),
};

const FILLED: Partial<Record<PvpEffectId, boolean>> = { high_stake: true, lifesteal: true };

export function PvpEffectIcon({ id, size = 14 }: { id: PvpEffectId; size?: number }) {
  const filled = FILLED[id];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICON_PATH[id]}
    </svg>
  );
}

// ป้ายเอฟเฟกต์ไว้โชว์บนการ์ด/แถบโจทย์ — ผู้ตอบต้องเห็นก่อนกดตอบ (ไม่ซ่อนหลัง hover)
export function PvpEffectBadge({ id }: { id: string }) {
  const meta = pvpEffectMeta(id);
  if (!meta) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      <PvpEffectIcon id={meta.id} size={12} />
      {meta.nameTh}
    </span>
  );
}
