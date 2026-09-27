import type { ReactNode } from "react";

const SUBJECT_META: Record<string, { emoji: string; label: string }> = {
  math: { emoji: "🧮", label: "คณิต" },
  science: { emoji: "🔬", label: "วิทย์" },
  physics: { emoji: "⚛️", label: "ฟิสิกส์" },
  chemistry: { emoji: "⚗️", label: "เคมี" },
  biology: { emoji: "🧬", label: "ชีวะ" },
};
export function subjectMeta(subject: string) {
  return SUBJECT_META[subject] ?? { emoji: "📚", label: "วิชา" };
}

// Shared lesson identity for PvP and solo Raid; effects and rules stay with each mode.
export default function LessonCardHeading({
  subject,
  chapter,
  difficulty,
  trailing,
  subjectClassName,
  chapterClassName,
}: {
  subject: string;
  chapter: string;
  difficulty: number;
  trailing?: ReactNode;
  subjectClassName?: string;
  chapterClassName?: string;
}) {
  const meta = subjectMeta(subject);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            subjectClassName ??
            "inline-flex items-center gap-1 rounded-full bg-indigo/15 px-2 py-0.5 text-[11px] font-bold text-indigo-hi"
          }
        >
          <span aria-hidden>{meta.emoji}</span> {meta.label} · ความยาก{" "}
          {difficulty}
        </span>
        {trailing}
      </div>
      <h3
        className={
          chapterClassName ?? "mt-1.5 font-sarabun text-sm font-bold text-text"
        }
      >
        {chapter}
      </h3>
    </>
  );
}
