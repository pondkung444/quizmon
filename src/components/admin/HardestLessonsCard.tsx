"use client";

import { useState } from "react";
import { CHART_INDIGO, CHART_RED } from "./BarChartCard";

export type HardestLessonRow = {
  category: string;
  count: number;
  accuracyPct: number;
  avgTimeSec: number;
};

type Band = "all" | "junior" | "senior";

// ตัด/ต่อจาก 3 ชุดข้อมูลที่คำนวณมาแล้วฝั่ง server (all/junior/senior) แทนกรองใน client —
// category ผูกกับ grade_band แบบ 1:1 อยู่แล้ว (ไม่มีหมวดชื่อซ้ำข้ามกลุ่ม) คำนวณล่วงหน้าฝั่ง
// server ถูกกว่า ส่งมาแค่ 3 array เล็กๆ ให้ toggle สลับ ไม่ต้อง query ซ้ำ
export default function HardestLessonsCard({
  all,
  junior,
  senior,
  minConfidence,
}: {
  all: HardestLessonRow[];
  junior: HardestLessonRow[];
  senior: HardestLessonRow[];
  minConfidence: number;
}) {
  const [band, setBand] = useState<Band>("all");
  const rows = band === "all" ? all : band === "junior" ? junior : senior;

  return (
    <div className="rounded-2xl border border-gold-dim bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-gold-hi">บทเรียนยากสุด</h2>
          <p className="mt-0.5 text-xs text-text3">เรียงจากความแม่นน้อย→มาก</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border">
          {([
            ["all", "ทั้งหมด"],
            ["junior", "ม.ต้น"],
            ["senior", "ม.ปลาย"],
          ] as [Band, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setBand(value)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                band === value ? "bg-amber text-track" : "bg-track text-text3"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-text3">ยังไม่มีข้อมูลพอ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text3">
                  <th className="py-2 pr-3 font-medium">หมวด</th>
                  <th className="py-2 pr-3 font-medium">ความแม่น</th>
                  <th className="py-2 pr-3 font-medium">เวลาเฉลี่ย</th>
                  <th className="py-2 pr-3 font-medium text-right">จำนวนข้อ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isBad = row.accuracyPct < 50;
                  const lowConfidence = row.count < minConfidence;
                  return (
                    <tr key={row.category} className="border-b border-border/50">
                      <td className={`py-2 pr-3 ${isBad ? "font-bold text-red" : "text-text"}`}>
                        {isBad && "⚠️ "}
                        {row.category}
                        {lowConfidence && (
                          <span className="ml-2 rounded-full bg-track px-2 py-0.5 text-[10px] font-normal text-text3">
                            n น้อย
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-track">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, row.accuracyPct)}%`,
                                backgroundColor: isBad ? CHART_RED : CHART_INDIGO,
                                opacity: isBad ? 1 : 0.85,
                              }}
                            />
                          </div>
                          <span className={isBad ? "font-bold text-red" : "text-text2"}>{row.accuracyPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-text2">{row.avgTimeSec.toFixed(1)} วิ</td>
                      <td className="py-2 pr-3 text-right text-text2">{row.count.toLocaleString("th-TH")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
