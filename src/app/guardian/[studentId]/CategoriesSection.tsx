"use client";

import { useState } from "react";

export type CategoryRow = {
  subject: string;
  category: string;
  answered_count: number;
  tier: string;
};

const SUBJECT_LABEL: Record<string, string> = { math: "คณิตศาสตร์", science: "วิทยาศาสตร์" };

const TIER_COLOR: Record<string, string> = {
  คล่องแล้ว: "text-gold-hi",
  กำลังไปได้: "text-text2",
  ยังต้องฝึก: "text-amber",
};

function CategoryRowItem({ row }: { row: CategoryRow }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-track px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{row.category}</p>
        <p className="text-xs text-text3">
          {SUBJECT_LABEL[row.subject] ?? row.subject} · {row.answered_count} ข้อ
        </p>
      </div>
      <span className={`flex-none text-sm font-semibold ${TIER_COLOR[row.tier] ?? "text-text2"}`}>{row.tier}</span>
    </li>
  );
}

// guardian_get_categories() คืนทุก category ที่เข้าเกณฑ์ (>=10 ข้อ ใน 30 วัน) ไม่ตัดเหลือ 3 ให้ —
// slice(0,3) ที่นี่สำหรับ default view แล้วใช้ list เดิมตอนกด "ดูทั้งหมด" ไม่ยิง RPC ซ้ำ
export default function CategoriesSection({ categories }: { categories: CategoryRow[] }) {
  const [showAll, setShowAll] = useState(false);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-text3">
        ยังเก็บข้อมูลไม่พอ (ต้องตอบอย่างน้อย 10 ข้อในบทเดียวกัน ภายใน 30 วัน)
      </p>
    );
  }

  const visible = showAll ? categories : categories.slice(0, 3);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {visible.map((row) => (
          <CategoryRowItem key={`${row.subject}:${row.category}`} row={row} />
        ))}
      </ul>
      {!showAll && categories.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto mt-1 rounded px-2 py-1 text-xs font-medium text-amber underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          ดูทั้งหมด ({categories.length})
        </button>
      )}
    </div>
  );
}
