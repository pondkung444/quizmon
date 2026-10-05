"use client";

import {
  BAND_LABEL,
  MAX_CHAPTERS,
  addChapters,
  availableBands,
  chaptersOfGroup,
  groupByLevel,
  subjectGroups,
  type ChapterRow,
} from "@/lib/teamBattle/scope";
import type { GradeBand, QuestionLevel } from "@/lib/teamBattle/types";

// เลือกขอบเขตโจทย์: ช่วงชั้น → วิชา(+branch) → บท (controlled — state อยู่ที่ CreatePanel)
// DB บังคับ 1 วิชา/branch ต่อเกม จึงเลือกข้ามชุดไม่ได้ (เปลี่ยนชุดแล้วล้างบทที่เลือก)

export type ScopeValue = { band: GradeBand | null; groupKey: string | null; chapters: string[] };

export type CountStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "result"; level: QuestionLevel; count: number }
  | { kind: "error"; message: string };

const pill = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition active:scale-95 ${
    on ? "border-gold bg-amber font-bold text-on-amber" : "border-border bg-track text-text2 hover:border-gold-dim"
  }`;

export default function ScopePicker({
  rows,
  value,
  onChange,
  status,
  truncated,
  onTruncated,
}: {
  rows: ChapterRow[];
  value: ScopeValue;
  onChange: (v: ScopeValue) => void;
  status: CountStatus;
  truncated: boolean;
  onTruncated: (t: boolean) => void;
}) {
  const bands = availableBands(rows);
  const groups = value.band ? subjectGroups(rows, value.band) : [];
  const chapters = value.groupKey ? chaptersOfGroup(rows, value.groupKey) : [];
  const levels = groupByLevel(chapters);

  function toggle(chapter: string, on: boolean) {
    onTruncated(false);
    if (!on) return onChange({ ...value, chapters: value.chapters.filter((c) => c !== chapter) });
    const { next, truncated: cut } = addChapters(value.chapters, [chapter]);
    onTruncated(cut);
    onChange({ ...value, chapters: next });
  }

  function selectAll(list: ChapterRow[]) {
    const { next, truncated: cut } = addChapters(value.chapters, list.map((c) => c.chapter));
    onTruncated(cut);
    onChange({ ...value, chapters: next });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold text-gold-hi">1. เลือกขอบเขตโจทย์</h2>

      <p className="mt-3 text-sm text-text2">ช่วงชั้น</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {bands.map((b) => (
          <button
            key={b}
            type="button"
            className={pill(value.band === b)}
            onClick={() => {
              onTruncated(false);
              onChange({ band: b, groupKey: null, chapters: [] });
            }}
          >
            {BAND_LABEL[b]}
          </button>
        ))}
      </div>

      {value.band && (
        <>
          <p className="mt-4 text-sm text-text2">วิชา</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                className={pill(value.groupKey === g.key)}
                onClick={() => {
                  onTruncated(false);
                  onChange({ ...value, groupKey: g.key, chapters: [] });
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-text3">เกมหนึ่งเลือกได้วิชาเดียว เพื่อให้ทุกคนในห้องตอบโจทย์ชุดเดียวกัน</p>
        </>
      )}

      {value.groupKey && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-text2">
              บทเรียน ({value.chapters.length}/{MAX_CHAPTERS} บท)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => selectAll(chapters)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-text2 hover:border-gold-dim"
              >
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => {
                  onTruncated(false);
                  onChange({ ...value, chapters: [] });
                }}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-text2 hover:border-gold-dim"
              >
                ล้าง
              </button>
            </div>
          </div>
          {truncated && (
            <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
              เลือกได้สูงสุด {MAX_CHAPTERS} บทต่อเกม จึงเลือกให้ครบเท่าที่ได้ — ปรับเพิ่ม/ลดเองได้เลย
            </p>
          )}
          <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border bg-track p-2">
            {levels.map((lv) => (
              <div key={lv.level} className="mb-2 last:mb-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text3">{lv.level}</p>
                  <button
                    type="button"
                    onClick={() => selectAll(lv.rows)}
                    className="text-[11px] text-text3 underline hover:text-gold-hi"
                  >
                    เลือกทั้งระดับ
                  </button>
                </div>
                {lv.rows.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-1 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={value.chapters.includes(c.chapter)}
                      onChange={(e) => toggle(c.chapter, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">{c.chapter}</span>
                    <span className="shrink-0 text-xs text-text3">{c.question_count} ข้อ</span>
                    {!c.is_available && (
                      <span className="shrink-0 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold text-warn">
                        โจทย์น้อย
                      </span>
                    )}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <CountBox status={status} hasChapters={value.chapters.length > 0} />
    </section>
  );
}

function CountBox({ status, hasChapters }: { status: CountStatus; hasChapters: boolean }) {
  if (!hasChapters) return <p className="mt-3 text-xs text-text3">เลือกบทเรียนอย่างน้อย 1 บทเพื่อดูจำนวนโจทย์</p>;
  if (status.kind === "idle" || status.kind === "pending")
    return <p className="mt-3 text-sm text-text3">กำลังนับโจทย์…</p>;
  if (status.kind === "error")
    return <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{status.message}</p>;
  const tone =
    status.level === "ok"
      ? "bg-good/10 text-good"
      : status.level === "warn"
        ? "bg-warn/10 text-warn"
        : "bg-red/10 text-red";
  const text =
    status.level === "ok"
      ? "โจทย์เพียงพอ"
      : status.level === "warn"
        ? "โจทย์ค่อนข้างน้อย บางข้ออาจซ้ำ"
        : "โจทย์ยังน้อยเกินไป ลองเพิ่มบท";
  return (
    <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${tone}`}>
      มีโจทย์ {status.count} ข้อ · {text}
    </p>
  );
}
