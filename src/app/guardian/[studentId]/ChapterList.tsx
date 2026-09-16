"use client";

import { useState } from "react";

type CategoryRow = {
  subject: string;
  branch: string | null;
  chapter_key: string;
  chapter: string;
  answered_count: number;
  accuracy: number;
  tier: string;
};

// ลำดับความสำคัญตอนโชว์: บทที่ "ยังต้องฝึก" ขึ้นก่อนเสมอ (สิ่งที่ผู้ปกครองอยากรู้ที่สุด) —
// ตาม B2 ในเอกสารออกแบบ: ห้ามแสดงเป็น % ใช้แค่ระดับ + จำนวนข้อกำกับ, หน้าแรกโชว์ 3 บท + ดูทั้งหมด
const TIER_ORDER: Record<string, number> = {
  ยังต้องฝึก: 0,
  กำลังไปได้: 1,
  คล่องแล้ว: 2,
};

function tierBadgeClass(tier: string): string {
  if (tier === "คล่องแล้ว") return "bg-amber/15 text-amber";
  if (tier === "กำลังไปได้") return "bg-gold/15 text-gold-hi";
  return "bg-red/10 text-red";
}

export default function ChapterList({ categories }: { categories: CategoryRow[] }) {
  const [expanded, setExpanded] = useState(false);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-text3">
        ยังไม่มีบทที่ข้อมูลพอจะแสดง (ต้องตอบอย่างน้อย 10 ข้อในบทนั้นภายใน 30 วันล่าสุด)
      </p>
    );
  }

  const sorted = [...categories].sort((a, b) => {
    const tierDiff = (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99);
    if (tierDiff !== 0) return tierDiff;
    return b.answered_count - a.answered_count;
  });
  const visible = expanded ? sorted : sorted.slice(0, 3);

  return (
    <div className="flex flex-col gap-2">
      {visible.map((c) => (
        <div
          key={c.chapter_key}
          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-track px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm text-text">{c.chapter}</p>
            <p className="text-xs text-text3">{c.answered_count} ข้อ</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tierBadgeClass(c.tier)}`}
          >
            {c.tier}
          </span>
        </div>
      ))}

      {sorted.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 self-start text-xs font-medium text-gold-hi underline underline-offset-2"
        >
          {expanded ? "ย่อกลับ" : `ดูทั้งหมด (${sorted.length})`}
        </button>
      )}
    </div>
  );
}
