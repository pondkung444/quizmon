"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { RaidStatKey, RaidStatRecord } from "@/lib/raid/stats";

const AXES: { key: RaidStatKey; label: string }[] = [
  { key: "atk", label: "ATK" },
  { key: "def", label: "DEF" },
  { key: "spd", label: "SPD" },
  { key: "hp", label: "HP" },
  { key: "foc", label: "FOC" },
];

const RAW_COLOR = "#9498a3"; // --color-text3
const EFFECTIVE_COLOR = "#4ade80"; // เขียวธีม readiness (ตรงกับ RaidReadinessGauge ตอนพร้อม)

// ต่างจาก StatRadar.tsx (โชว์ค่าดิบเทียบเพดานคงที่ 120) — ที่นี่ normalize เป็น % ของ cap ต่อไข่ตัวนั้น
// เสมอ (cap ไม่เท่ากันข้ามไข่ ตรวจแล้วใน stat-formula-VERIFIED) และซ้อน 2 เส้น: raw (ก่อนใส่ของ) กับ
// effective (รวมของแล้ว) ให้เห็นผลของการใส่อุปกรณ์ชัดเจนบนแกนเดียวกัน
export default function RaidStatRadar({
  raw,
  effective,
  caps,
}: {
  raw: RaidStatRecord;
  effective: RaidStatRecord;
  caps: RaidStatRecord;
}) {
  const data = AXES.map(({ key, label }) => ({
    stat: label,
    raw: caps[key] > 0 ? Math.round((raw[key] / caps[key]) * 100) : 0,
    effective: caps[key] > 0 ? Math.round((effective[key] / caps[key]) * 100) : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#3a3d47" />
        <PolarAngleAxis dataKey="stat" tick={{ fill: "#9498a3", fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar name="พื้นฐาน" dataKey="raw" stroke={RAW_COLOR} strokeDasharray="4 4" fill="none" />
        <Radar name="รวมอุปกรณ์" dataKey="effective" stroke={EFFECTIVE_COLOR} fill={EFFECTIVE_COLOR} fillOpacity={0.25} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
