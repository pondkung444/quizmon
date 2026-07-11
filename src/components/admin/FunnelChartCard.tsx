"use client";

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type FunnelStep = { label: string; count: number };

type FunnelDatum = FunnelStep & { pct: number };

function FunnelTooltip({ active, payload }: { active?: boolean; payload?: { payload: FunnelDatum }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gold-dim bg-track px-3 py-2 text-xs shadow-lg">
      <p className="text-text2">{d.label}</p>
      <p className="font-bold text-text">{d.count.toLocaleString("th-TH")}</p>
      <p className="text-text3">{d.pct.toFixed(0)}% ของขั้นก่อนหน้า</p>
    </div>
  );
}

// แท่งแนวนอนลดหลั่นกัน (ไม่ใช้ funnel component พิเศษ) — % ที่โชว์ต่อแท่งคือ % ที่รอดจาก
// "ขั้นก่อนหน้า" ไม่ใช่ % จากขั้นแรก (drop-off ต่อขั้นดูง่ายกว่าตามที่ตกลงกันไว้)
export default function FunnelChartCard({ steps, color }: { steps: FunnelStep[]; color: string }) {
  if (steps.length === 0 || steps[0].count === 0) {
    return <p className="py-8 text-center text-sm text-text3">ยังไม่มีข้อมูลพอ</p>;
  }

  const data: FunnelDatum[] = steps.map((s, i) => ({
    ...s,
    pct: i === 0 ? 100 : steps[i - 1].count > 0 ? (s.count / steps[i - 1].count) * 100 : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 16}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 8, bottom: 4 }} barCategoryGap="28%">
        <XAxis type="number" hide domain={[0, data[0].count || 1]} />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={96}
        />
        <Tooltip content={<FunnelTooltip />} cursor={{ fill: "#3a3d47", opacity: 0.3 }} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} maxBarSize={28}>
          <LabelList
            dataKey="count"
            position="right"
            content={(props) => {
              const { x, y, width, height, index } = props;
              const i = index as number;
              const d = data[i];
              const text = i === 0 ? d.count.toLocaleString("th-TH") : `${d.count.toLocaleString("th-TH")} (${d.pct.toFixed(0)}%)`;
              return (
                <text
                  x={(x as number) + (width as number) + 8}
                  y={(y as number) + (height as number) / 2}
                  dy={4}
                  fontSize={12}
                  fill="#e4e4e7"
                >
                  {text}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
