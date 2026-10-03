"use client";

import { useState } from "react";
import { ANALYTICS_BANDS, BAND_LABELS, MIN_LESSON_ATTEMPTS, MIN_LESSON_STUDENTS, type AnalyticsBand, type AnalyticsDashboardData } from "@/lib/adminAnalytics";

export default function AnalyticsLessonsCard({ lessons }: { lessons: AnalyticsDashboardData["lessons"] }) {
  const [band, setBand] = useState<AnalyticsBand | "all">("all");
  const rows = lessons.filter((row) => band === "all" || row.band === band).slice(0, 10);
  const tabs = [{ value: "all" as const, label: "ทั้งหมด" }, ...ANALYTICS_BANDS
    .filter((value) => value !== "unknown" || lessons.some((row) => row.band === value))
    .map((value) => ({ value, label: BAND_LABELS[value] }))];
  return <section className="rounded-2xl border border-gold-dim bg-card p-5">
    <h2 className="text-sm font-bold text-gold-hi">บทเรียนที่ควรทบทวน</h2>
    <p className="mt-1 text-xs text-text3">14 วันรวมวันนี้ · แสดง 10 บทเรียนที่อัตราตอบถูกต่ำสุด โดยนำกลุ่มที่มีอย่างน้อย {MIN_LESSON_ATTEMPTS} คำตอบจาก {MIN_LESSON_STUDENTS} คนขึ้นก่อน</p>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="กรองช่วงชั้นของบทเรียน">
      {tabs.map((tab) => <button key={tab.value} type="button" aria-pressed={band === tab.value} onClick={() => setBand(tab.value)}
        className={`rounded-lg border border-border px-3 py-2 text-xs font-medium transition ${band === tab.value ? "bg-amber text-on-amber" : "bg-track text-text3"}`}>
        {tab.label}
      </button>)}
    </div>
    {rows.length === 0 ? <p className="py-8 text-center text-sm text-text3">ยังไม่มีคำตอบที่เชื่อมกับบทเรียนในกลุ่มนี้</p> :
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-border text-xs text-text3">
          <th scope="col" className="pb-3 pr-4">บทเรียน / ช่วงชั้น</th><th scope="col" className="pb-3 pr-4 text-right">อัตราตอบถูก</th>
          <th scope="col" className="pb-3 pr-4 text-right">คำตอบ</th><th scope="col" className="pb-3 text-right">คนที่ฝึก</th>
        </tr></thead><tbody>{rows.map((row) => <tr key={JSON.stringify([row.band, row.category])} className="border-b border-border/50">
          <th scope="row" className="py-3 pr-4 font-medium text-text">
            {row.category}<span className="mt-1 block text-xs font-normal text-text3">{BAND_LABELS[row.band]}{!row.reliable && " · ข้อมูลยังน้อย"}</span>
          </th>
          <td className={`py-3 pr-4 text-right ${row.reliable && (row.accuracyPct ?? 100) < 50 ? "font-bold text-red" : "text-text2"}`}>{row.accuracyPct == null ? "—" : `${row.accuracyPct.toFixed(0)}%`}</td>
          <td className="py-3 pr-4 text-right text-text2">{row.attempts.toLocaleString("th-TH")}</td>
          <td className="py-3 text-right text-text2">{row.students.toLocaleString("th-TH")}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
