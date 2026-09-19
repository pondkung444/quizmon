"use client";

import { useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import {
  accuracyBgClass,
  subjectLabel,
  tierBgClass,
  tierTagClass,
  type CategoryRow,
  type CurriculumChapter,
} from "./shared";

const INITIAL_COUNT = 8;

export default function ChapterCompare({
  categories,
  curriculum,
}: {
  categories: CategoryRow[];
  curriculum: CurriculumChapter[];
}) {
  const [view, setView] = useState<"list" | "heatmap">("list");
  const [expanded, setExpanded] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  // อ่อน→แข็ง: accuracy ต่ำสุดก่อน (จำนวนข้อมากกว่าก่อนเมื่อเท่ากัน)
  const sorted = [...categories].sort(
    (a, b) => a.accuracy - b.accuracy || b.answered_count - a.answered_count
  );
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_COUNT);

  const byKey = new Map(categories.map((c) => [c.chapter_key, c]));
  const groups = new Map<string, CurriculumChapter[]>();
  for (const ch of [...curriculum].sort((a, b) => a.chapter_order - b.chapter_order)) {
    const key = subjectLabel(ch.subject, ch.branch);
    groups.set(key, [...(groups.get(key) ?? []), ch]);
  }
  const pickedChapter = picked ? curriculum.find((c) => c.chapter_key === picked) : null;
  const pickedCat = picked ? byKey.get(picked) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gold-hi">เทียบบท (30 วันล่าสุด)</p>
        <div className="flex rounded-full border border-border p-0.5 text-xs">
          {(
            [
              ["list", "เรียงอ่อน→แข็ง", List],
              ["heatmap", "ตามหลักสูตร", LayoutGrid],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 transition ${
                view === key ? "bg-gold-hi/15 font-bold text-gold-hi" : "text-text3"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-text3">
          ยังไม่มีบทที่ข้อมูลพอจะแสดง (ต้องตอบอย่างน้อย 10 ข้อในบทนั้นภายใน 30 วันล่าสุด)
        </p>
      ) : view === "list" ? (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            {visible.map((c) => (
              <div key={c.chapter_key} className="rounded-lg border border-border bg-track px-3 py-2">
                <p className="truncate text-sm text-text">{c.chapter}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className={`h-full rounded-full ${accuracyBgClass(c.accuracy)}`}
                      style={{ width: `${c.accuracy}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs font-semibold text-text">{c.accuracy}%</span>
                  <span className="shrink-0 text-[11px] text-text3">{c.answered_count} ข้อ</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tierTagClass(c.tier)}`}>
                    {c.tier}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {sorted.length > INITIAL_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-xs font-medium text-gold-hi underline underline-offset-2"
            >
              {expanded ? "ย่อกลับ" : `ดูทั้งหมด (${sorted.length} บท)`}
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {[...groups.entries()].map(([label, chapters]) => (
            <div key={label}>
              <p className="mb-1.5 text-xs font-semibold text-text2">{label}</p>
              <div className="grid grid-cols-8 gap-1.5 md:grid-cols-12">
                {chapters.map((ch, i) => {
                  const cat = byKey.get(ch.chapter_key);
                  return (
                    <button
                      key={ch.chapter_key}
                      type="button"
                      onClick={() => setPicked(ch.chapter_key)}
                      aria-label={`${ch.chapter}: ${cat ? `${cat.tier} ${cat.accuracy}%` : "ยังไม่มีข้อมูลพอ"}`}
                      className={`flex aspect-square items-center justify-center rounded-md text-[10px] font-bold text-track ${
                        cat ? tierBgClass(cat.tier) : "border border-dashed border-border bg-transparent text-text3"
                      } ${picked === ch.chapter_key ? "ring-2 ring-gold-hi" : ""}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text3">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-good" />คล่องแล้ว</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-warn" />กำลังไปได้</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red" />ยังต้องฝึก</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm border border-dashed border-text3" />ข้อมูลยังไม่พอ</span>
          </div>
          {pickedChapter && (
            <div className="rounded-lg border border-border bg-track px-3 py-2 text-sm">
              <p className="text-text">{pickedChapter.chapter}</p>
              <p className="text-xs text-text2">
                {pickedCat
                  ? `${pickedCat.tier} · ${pickedCat.accuracy}% · ${pickedCat.answered_count} ข้อ`
                  : "ยังไม่มีข้อมูลพอ (ต้องตอบอย่างน้อย 10 ข้อใน 30 วัน)"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
