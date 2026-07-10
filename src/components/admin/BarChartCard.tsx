"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// สีชาร์ตแยกจาก --color-amber ของ UI ตั้งใจ — #d4791f ผ่าน dark-mode lightness band (OKLCH L
// 0.48-0.67) และ chroma floor ของ dataviz skill ส่วน --color-amber ปกติ (#e0863a) L สูงเกินแบนด์
// สำหรับ mark ของกราฟ (ใช้ได้ดีแค่กับปุ่ม/ตัวหนังสือ) — ดู supabase/migrations ไม่เกี่ยวกัน อันนี้
// เป็นโน้ตของทีม dataviz เท่านั้น
export const CHART_AMBER = "#d4791f";
export const CHART_INDIGO = "#7089d1";
export const CHART_RED = "#d8362f";

type BarChartCardDatum = {
  label: string;
  value: number;
};

function ChartTooltip({
  active,
  payload,
  valueSuffix,
}: {
  active?: boolean;
  payload?: { payload: BarChartCardDatum }[];
  valueSuffix?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-gold-dim bg-track px-3 py-2 text-xs shadow-lg">
      <p className="text-text2">{datum.label}</p>
      <p className="font-bold text-text">
        {datum.value.toLocaleString("th-TH")}
        {valueSuffix ?? ""}
      </p>
    </div>
  );
}

// แท่งเดียว hue เดียว (magnitude ต่อหมวด) — ใช้ซ้ำได้กับ drop-off %, เวลาต่อหน้าจอ, จำนวนไข่ที่ฟัก
export default function BarChartCard({
  data,
  color = CHART_AMBER,
  valueSuffix,
  height = 220,
}: {
  data: BarChartCardDatum[];
  color?: string;
  valueSuffix?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-text3">ยังไม่มีข้อมูลพอ</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="#3a3d47" strokeOpacity={0.6} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          axisLine={{ stroke: "#3a3d47" }}
          tickLine={false}
          interval={0}
          angle={data.length > 6 ? -25 : 0}
          textAnchor={data.length > 6 ? "end" : "middle"}
          height={data.length > 6 ? 48 : 24}
        />
        <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} />} cursor={{ fill: "#3a3d47", opacity: 0.3 }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
