"use client";

import { useMemo, useState } from "react";
import type { ChapterOption, TopicFilter } from "@/app/quiz/actions";

// tab พิเศษสำหรับบทที่ grade_level IS NULL (สถิติเบื้องต้น, อะตอมและตารางธาตุ ตอนนี้)
const COMBINED_TAB_LABEL = "ข้อสอบรวม";

type GradeTab = { key: string; label: string; gradeLevel: string | null; order: number };

function buildTabs(chapters: ChapterOption[]): GradeTab[] {
  const seen = new Map<string, GradeTab>();
  for (const c of chapters) {
    const key = c.gradeLevel ?? "__combined__";
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      label: c.gradeLevel ?? COMBINED_TAB_LABEL,
      gradeLevel: c.gradeLevel,
      // บทรวม (grade_order 0) ให้ไปท้ายสุดเสมอ ตามดีไซน์ (ม.1 → … → ม.6 → ข้อสอบรวม)
      order: c.gradeLevel === null ? Number.MAX_SAFE_INTEGER : c.gradeOrder,
    });
  }
  return [...seen.values()].sort((a, b) => a.order - b.order);
}

export default function TopicSelectPanel({
  chapters,
  defaultGradeLevel,
  onBack,
  onSelect,
}: {
  chapters: ChapterOption[];
  defaultGradeLevel: string | null;
  onBack: () => void;
  onSelect: (filter: TopicFilter) => void;
}) {
  const tabs = useMemo(() => buildTabs(chapters), [chapters]);

  const initialTab =
    tabs.find((t) => t.gradeLevel === defaultGradeLevel)?.key ?? tabs[0]?.key ?? "";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const tabChapters = useMemo(() => {
    const tab = tabs.find((t) => t.key === activeTab);
    if (!tab) return [];
    return chapters.filter((c) => (c.gradeLevel ?? "__combined__") === tab.key);
  }, [chapters, tabs, activeTab]);

  const subjects = useMemo(() => {
    const labels: string[] = [];
    for (const c of tabChapters) if (!labels.includes(c.subjectLabel)) labels.push(c.subjectLabel);
    return labels;
  }, [tabChapters]);

  const currentSubject = activeSubject ?? subjects[0] ?? null;

  const visibleChapters = useMemo(() => {
    const q = query.trim();
    if (q) return tabChapters.filter((c) => c.chapter.includes(q));
    return tabChapters.filter((c) => c.subjectLabel === currentSubject);
  }, [tabChapters, query, currentSubject]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="กลับไปเลือกวิชา"
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-text3 transition active:scale-95"
        >
          ‹
        </button>
        <div>
          <h1 className="text-xl font-bold text-gold-hi">เลือกบทที่จะฝึก</h1>
          <p className="text-xs text-text3">โหมดนี้ไม่นับคะแนนลีดเดอร์บอร์ด แต่ Qmon ยังโตปกติ</p>
        </div>
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text3">🔍</span>
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อบท..."
          className="w-full rounded-2xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-text outline-none focus:border-gold-dim"
        />
      </div>

      {!query.trim() && (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setActiveTab(t.key);
                  setActiveSubject(null);
                }}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-bold transition ${
                  t.key === activeTab
                    ? "border-gold bg-amber/15 text-gold-hi"
                    : "border-border bg-card text-text3"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {subjects.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveSubject(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    s === currentSubject
                      ? "border-gold-dim bg-amber/10 text-gold-hi"
                      : "border-border bg-card text-text3"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <div className="flex flex-col gap-2">
        {visibleChapters.length === 0 && (
          <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-text3">
            ไม่พบบทที่ค้นหา
          </p>
        )}

        {visibleChapters.map((c) => {
          const key = `${c.gradeBand}|${c.subject}|${c.branch ?? "-"}|${c.chapter}`;
          if (!c.isAvailable) {
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 opacity-40"
              >
                <div>
                  <p className="text-sm font-bold text-text">{c.chapter}</p>
                  {query.trim() && <p className="text-xs text-text3">{c.subjectLabel}</p>}
                </div>
                <span className="shrink-0 text-xs text-text3">ยังไม่พร้อมใช้งาน</span>
              </div>
            );
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                onSelect({
                  gradeBand: c.gradeBand,
                  subject: c.subject,
                  branch: c.branch,
                  chapter: c.chapter,
                })
              }
              className="flex items-center justify-between rounded-2xl border border-gold-dim bg-card px-4 py-3 text-left transition hover:border-gold active:scale-[0.98]"
            >
              <div>
                <p className="text-sm font-bold text-text">{c.chapter}</p>
                <p className="text-xs text-text3">
                  {query.trim() ? `${c.subjectLabel} · ` : ""}
                  {c.questionCount} ข้อ
                </p>
              </div>
              <span className="shrink-0 text-lg text-gold-hi">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
