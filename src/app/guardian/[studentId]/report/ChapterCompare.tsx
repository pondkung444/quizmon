"use client";

import { useState } from "react";
import { List, LayoutGrid } from "lucide-react";
import BottomSheet from "@/components/social/BottomSheet";
import {
  accuracyBgClass,
  gradeLabel,
  subjectLabel,
  tierBgClass,
  tierTagClass,
  type CategoryRow,
  type CurriculumChapter,
} from "../overview/shared";

// จัดกลุ่มตามระดับชั้นก่อนเสมอ (grade_order น้อย→มาก) — chapter_order เริ่มใหม่ทุกชั้น ถ้าไม่แยกกลุ่ม
// จะดูเหมือนบทเรียงต่อเนื่องข้ามชั้นและงง
function groupByGrade<T extends { grade_level: string | null; grade_order: number }>(
  rows: T[]
): { key: string; label: string; rows: T[] }[] {
  const map = new Map<number, { label: string; rows: T[] }>();
  for (const r of rows) {
    const g = map.get(r.grade_order) ?? { label: gradeLabel(r.grade_level), rows: [] };
    g.rows.push(r);
    map.set(r.grade_order, g);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([order, g]) => ({ key: String(order), ...g }));
}

function GradeHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="rounded-full bg-mint/15 px-3 py-0.5 text-xs font-bold text-mint">{label}</span>
      <span className="text-[11px] text-text3">{count} บท</span>
      <span className="h-px flex-1 bg-(--gd-accent-border)/60" />
    </div>
  );
}

export default function ChapterCompare({
  categories,
  curriculum,
}: {
  categories: CategoryRow[];
  curriculum: CurriculumChapter[];
}) {
  const [view, setView] = useState<"list" | "heatmap">("list");
  const [picked, setPicked] = useState<string | null>(null);

  const byKey = new Map(categories.map((c) => [c.chapter_key, c]));
  const listGroups = groupByGrade(categories).map((g) => ({
    ...g,
    // อ่อน→แข็งภายในชั้น: accuracy ต่ำสุดก่อน (จำนวนข้อมากกว่าก่อนเมื่อเท่ากัน)
    rows: [...g.rows].sort((a, b) => a.accuracy - b.accuracy || b.answered_count - a.answered_count),
  }));
  const heatGroups = groupByGrade(curriculum).map((g) => {
    const bySubject = new Map<string, CurriculumChapter[]>();
    for (const ch of [...g.rows].sort((a, b) => a.chapter_order - b.chapter_order)) {
      const k = subjectLabel(ch.subject, ch.branch);
      bySubject.set(k, [...(bySubject.get(k) ?? []), ch]);
    }
    return { ...g, subjects: [...bySubject.entries()] };
  });
  const pickedChapter = picked ? curriculum.find((c) => c.chapter_key === picked) : null;
  const pickedCat = picked ? byKey.get(picked) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-mint">เทียบบท (30 วันล่าสุด)</p>
        <div className="gd-pill-group text-xs">
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
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 transition ${
                view === key ? "gd-pill-active" : "text-text2"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {categories.length === 0 && view === "list" ? (
        <p className="text-sm text-text3">
          ยังไม่มีบทที่ข้อมูลพอจะแสดง (ต้องตอบอย่างน้อย 10 ข้อในบทนั้นภายใน 30 วันล่าสุด)
        </p>
      ) : view === "list" ? (
        <div className="flex flex-col gap-5">
          {listGroups.map((g) => (
            <section key={g.key}>
              <GradeHeader label={g.label} count={g.rows.length} />
              <div className="grid gap-2 md:grid-cols-2">
                {g.rows.map((c) => (
                  <div key={c.chapter_key} className="gd-row px-3 py-2.5">
                    <p className="truncate text-sm text-text">{c.chapter}</p>
                    <p className="text-[11px] text-text3">{subjectLabel(c.subject, c.branch)}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--gd-empty)">
                        <div
                          className={`h-full rounded-full ${accuracyBgClass(c.accuracy)}`}
                          style={{ width: `${c.accuracy}%` }}
                        />
                      </div>
                      <span className="w-9 shrink-0 text-right text-xs font-bold text-text">{c.accuracy}%</span>
                      <span className="shrink-0 text-[11px] text-text3">{c.answered_count} ข้อ</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tierTagClass(c.tier)}`}>
                        {c.tier}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {heatGroups.map((g) => (
            <section key={g.key}>
              <GradeHeader label={g.label} count={g.rows.length} />
              <div className="flex flex-col gap-3">
                {g.subjects.map(([label, chapters]) => (
                  <div key={label}>
                    <p className="mb-1.5 text-xs font-semibold text-text2">{label}</p>
                    <div className="grid grid-cols-8 gap-1.5 md:grid-cols-4">
                      {chapters.map((ch, i) => {
                        const cat = byKey.get(ch.chapter_key);
                        return (
                          <button
                            key={ch.chapter_key}
                            type="button"
                            onClick={() => setPicked(ch.chapter_key)}
                            aria-label={`${ch.chapter}: ${cat ? `${cat.tier} ${cat.accuracy}%` : "ยังไม่มีข้อมูลพอ"}`}
                            title={ch.chapter}
                            // มือถือ: ช่องเลขล้วน แตะแล้วเปิด bottom sheet บอกชื่อบท / ≥768px: กว้างพอใส่ชื่อบท (ตัด 2 บรรทัด) ในช่องเลย
                            className={`flex aspect-square items-center justify-center rounded-lg text-[11px] font-bold md:aspect-auto md:min-h-[56px] md:items-start md:justify-start md:gap-1.5 md:px-2 md:py-1.5 md:text-left ${
                              cat
                                ? `${tierBgClass(cat.tier)} text-(--gd-on-tier) shadow-[0_2px_8px_#00000055]`
                                : "border border-dashed border-(--gd-dash) bg-transparent text-text3"
                            } ${picked === ch.chapter_key ? "ring-2 ring-mint" : ""}`}
                          >
                            <span>{i + 1}</span>
                            <span className="hidden text-[11px] font-medium leading-tight md:line-clamp-2">{ch.chapter}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text3">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-good" />คล่องแล้ว</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-warn" />กำลังไปได้</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-red" />ยังต้องฝึก</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-sm border border-dashed border-text3" />ข้อมูลยังไม่พอ</span>
          </div>
          {pickedChapter && (
            <BottomSheet title={pickedChapter.chapter} onClose={() => setPicked(null)}>
              <p className="text-xs text-text3">
                {subjectLabel(pickedChapter.subject, pickedChapter.branch)} · {gradeLabel(pickedChapter.grade_level)}
              </p>
              {pickedCat ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tierTagClass(pickedCat.tier)}`}>
                    {pickedCat.tier}
                  </span>
                  <span className="text-sm text-text">{pickedCat.accuracy}%</span>
                  <span className="text-xs text-text2">· {pickedCat.answered_count} ข้อ (30 วันล่าสุด)</span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-text2">ยังไม่มีข้อมูลพอ (ต้องตอบอย่างน้อย 10 ข้อใน 30 วัน)</p>
              )}
            </BottomSheet>
          )}
        </div>
      )}
    </div>
  );
}
