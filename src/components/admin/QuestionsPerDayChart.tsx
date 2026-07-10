"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_AMBER } from "./BarChartCard";

export type QuestionsPerDayDatum = {
  dateLabel: string;
  total: number;
  activeUsers: number;
  isWeekend: boolean;
};

type Mode = "total" | "perUser";

function ChartTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: { payload: QuestionsPerDayDatum }[];
  mode: Mode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const perUser = d.activeUsers > 0 ? d.total / d.activeUsers : 0;
  return (
    <div className="rounded-lg border border-gold-dim bg-track px-3 py-2 text-xs shadow-lg">
      <p className="text-text2">
        {d.dateLabel}
        {d.isWeekend ? " (วันหยุด)" : ""}
      </p>
      <p className="font-bold text-text">
        {mode === "total"
          ? `${d.total.toLocaleString("th-TH")} ข้อ`
          : `${perUser.toFixed(1)} ข้อ/คน`}
      </p>
    </div>
  );
}

export default function QuestionsPerDayChart({ data }: { data: QuestionsPerDayDatum[] }) {
  const [mode, setMode] = useState<Mode>("total");

  const chartData = data.map((d) => ({
    ...d,
    plotted: mode === "total" ? d.total : d.activeUsers > 0 ? d.total / d.activeUsers : 0,
  }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setMode("total")}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              mode === "total" ? "bg-amber text-track" : "bg-track text-text3"
            }`}
          >
            รวมทั้งกลุ่ม
          </button>
          <button
            type="button"
            onClick={() => setMode("perUser")}
            className={`px-3 py-1.5 text-xs font-medium transition ${
              mode === "perUser" ? "bg-amber text-track" : "bg-track text-text3"
            }`}
          >
            เฉลี่ยต่อคน
          </button>
        </div>
        <p className="text-[11px] text-text3">
          <span className="inline-block h-2 w-3 rounded-sm align-middle" style={{ backgroundColor: CHART_AMBER, opacity: 0.4 }} />{" "}
          แท่งสีจาง = วันหยุด
        </p>
      </div>

      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-text3">ยังไม่มีข้อมูลพอ</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="#3a3d47" strokeOpacity={0.6} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              axisLine={{ stroke: "#3a3d47" }}
              tickLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 10))}
            />
            <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<ChartTooltip mode={mode} />} cursor={{ fill: "#3a3d47", opacity: 0.3 }} />
            <Bar dataKey="plotted" radius={[4, 4, 0, 0]} maxBarSize={20}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={CHART_AMBER} fillOpacity={d.isWeekend ? 0.4 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
