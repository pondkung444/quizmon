"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/social/BottomSheet";
import { accuracyBgClass, accuracyTextClass, subjectLabel, type TrendDay } from "./shared";

type DayRow = {
  subject: string;
  branch: string | null;
  chapter: string;
  correct_count: number;
  total_count: number;
  accuracy: number;
};

const WEEKDAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function weekdayOf(d: string): string {
  // d เป็น date string ของ Asia/Bangkok (YYYY-MM-DD) — parse เป็น UTC เพื่อไม่ให้วันเลื่อนตาม timezone เครื่อง
  return WEEKDAY_TH[new Date(`${d}T00:00:00Z`).getUTCDay()];
}

function dayOfMonth(d: string): number {
  return Number(d.slice(8, 10));
}

function longDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function TrendCard({ studentId, days30 }: { studentId: string; days30 : TrendDay[] }) {
  const [range, setRange] = useState<7 | 30>(7);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [error, setError] = useState(false);

  // ดึงมาครั้งเดียวด้วย p_days=30 แล้วตัด 7 วันท้ายฝั่ง client — ผลเท่ากับเรียก p_days=7 แยกเป๊ะ (end date เดียวกัน)
  const days = range === 7 ? days30.slice(-7) : days30;
  const maxCorrect = Math.max(1, ...days.map((x) => x.correct_count));
  const compact = range === 30;

  async function openDay(d: string) {
    setSelected(d);
    setRows(null);
    setError(false);
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("guardian_get_day_breakdown", {
      p_student_id: studentId,
      p_day: d,
    });
    if (err) {
      setError(true);
      return;
    }
    setRows((data ?? []) as DayRow[]);
  }

  const grouped = new Map<string, DayRow[]>();
  for (const r of rows ?? []) {
    const key = subjectLabel(r.subject, r.branch);
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  const selectedDay = days30.find((x) => x.d === selected);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-mint">แนวโน้มการตอบถูก</p>
        <div className="gd-pill-group text-xs">
          {([7, 30] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRange(n)}
              className={`rounded-full px-3 py-1 transition ${
                range === n ? "gd-pill-active" : "text-text2"
              }`}
            >
              {n === 7 ? "7 วันล่าสุด" : "เดือนนี้"}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex h-40 items-end ${compact ? "gap-0.5" : "gap-2"}`}>
        {days.map((day, i) => {
          const h = day.has_data ? Math.max(6, (day.correct_count / maxCorrect) * 100) : 0;
          const showDayLabel = !compact || i % 5 === 0 || i === days.length - 1;
          return (
            <button
              key={day.d}
              type="button"
              disabled={!day.has_data}
              onClick={() => openDay(day.d)}
              aria-label={`${longDate(day.d)}: ตอบถูก ${day.correct_count} จาก ${day.total_count} ข้อ`}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 disabled:cursor-default"
            >
              {day.has_data && !compact && (
                <span className="text-xs font-bold text-text">{day.correct_count}</span>
              )}
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-md transition group-active:opacity-70 ${
                    day.has_data ? `${accuracyBgClass(day.accuracy ?? 0)} ${(day.accuracy ?? 0) >= 80 ? "gd-glow-good" : (day.accuracy ?? 0) >= 50 ? "gd-glow-warn" : "gd-glow-risk"}` : "bg-track"
                  }`}
                  style={{ height: day.has_data ? `${h}%` : "3px" }}
                />
              </div>
              {!compact && (
                <span className={`text-[10px] ${day.has_data ? accuracyTextClass(day.accuracy ?? 0) : "text-text3"}`}>
                  {day.has_data ? `${day.accuracy}%` : "–"}
                </span>
              )}
              <span className="h-4 text-[10px] text-text3">
                {showDayLabel ? (compact ? dayOfMonth(day.d) : weekdayOf(day.d)) : ""}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-text3">
        ความสูง = ข้อที่ตอบถูก · สี = ความแม่น · แตะแท่งเพื่อดูว่าเรียนบทไหนบ้าง (รวมทุกโหมด)
      </p>

      {selected && (
        <BottomSheet
          title={`${longDate(selected)}${
            selectedDay ? ` · ถูก ${selectedDay.correct_count}/${selectedDay.total_count} ข้อ` : ""
          }`}
          onClose={() => setSelected(null)}
        >
          {error ? (
            <p className="text-sm text-red">โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง</p>
          ) : rows === null ? (
            <p className="text-sm text-text3">กำลังโหลด...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text3">วันนี้ไม่มีข้อมูลการตอบ</p>
          ) : (
            <div className="flex flex-col gap-4">
              {[...grouped.entries()].map(([label, items]) => (
                <div key={label}>
                  <p className="mb-1.5 text-xs font-semibold text-text2">{label}</p>
                  <div className="flex flex-col gap-1.5">
                    {items.map((r) => (
                      <div
                        key={r.chapter}
                        className="gd-row flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm text-text">{r.chapter}</span>
                        <span className="shrink-0 text-xs text-text2">
                          {r.correct_count}/{r.total_count} ข้อ ·{" "}
                          <span className={`font-semibold ${accuracyTextClass(r.accuracy)}`}>{r.accuracy}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
