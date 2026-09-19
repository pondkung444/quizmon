"use client";

import { useState } from "react";
import { subjectLabel, TIER_RANK, type ChapterChange } from "./shared";

// เขียว = เพิ่งดีขึ้น, เหลือง = ลงมาเป็น "กำลังไปได้", แดง = ลงมาเป็น "ยังต้องฝึก"
function tone(c: ChapterChange): "good" | "warn" | "risk" | "neutral" {
  if (!c.changed || !c.current_tier || !c.previous_tier) return "neutral";
  if (TIER_RANK[c.current_tier] > TIER_RANK[c.previous_tier]) return "good";
  return c.current_tier === "ยังต้องฝึก" ? "risk" : "warn";
}

const TONE_CLASS = {
  good: "border-good/40 bg-good/10",
  warn: "border-warn/40 bg-warn/10",
  risk: "border-red/40 bg-red/10",
  neutral: "border-border bg-track",
};

const TONE_DOT = {
  good: "bg-good",
  warn: "bg-warn",
  risk: "bg-red",
  neutral: "bg-text3",
};

function headline(c: ChapterChange, kind: ReturnType<typeof tone>): string {
  if (kind === "neutral") {
    return c.current_tier ? `${c.chapter} — ${c.current_tier}` : `${c.chapter} — ข้อมูลสัปดาห์นี้ยังน้อย`;
  }
  return kind === "good" ? `${c.chapter} ดีขึ้น` : `${c.chapter} ลดลง`;
}

export default function InsightCards({ changes }: { changes: ChapterChange[] }) {
  const [showAll, setShowAll] = useState(false);

  const changed = changes.filter((c) => c.changed);
  const visible = showAll ? changes : changed;

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-gold-hi">จุดที่น่าสนใจ</p>

      {visible.length === 0 ? (
        <p className="text-sm text-text3">สัปดาห์นี้ยังไม่มีบทที่ระดับเปลี่ยนจากสัปดาห์ก่อน</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((c) => {
            const kind = tone(c);
            return (
              <div
                key={c.chapter_key}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${TONE_CLASS[kind]}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[kind]}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{headline(c, kind)}</p>
                  <p className="text-xs text-text2">
                    {subjectLabel(c.subject)}
                    {kind !== "neutral" && ` · ${c.previous_tier} → ${c.current_tier}`}
                    {` · สัปดาห์นี้ ${c.answered_count_current} ข้อ`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {changes.length > changed.length && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs font-medium text-gold-hi underline underline-offset-2"
        >
          {showAll ? "ดูเฉพาะที่เปลี่ยน" : `ดูทั้งหมด (${changes.length} บท)`}
        </button>
      )}
    </div>
  );
}
