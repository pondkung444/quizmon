"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import type { PvpPetStats } from "@/lib/pvp/stats";

// เพดานอ้างอิงคงที่ (stage-4 stat แต่ละแกนแตะ ~115) — สไลซ์ 1 ไม่มีอุปกรณ์ ใช้ค่าดิบล้วน
const AXIS_MAX = 120;

const AXES: { key: keyof PvpPetStats; label: string }[] = [
  { key: "atk", label: "โจมตี" },
  { key: "def", label: "ป้องกัน" },
  { key: "spd", label: "ความเร็ว" },
  { key: "hp", label: "พลังชีวิต" },
  { key: "foc", label: "คริ" },
];

export default function PvpStatRadar({ stats }: { stats: PvpPetStats }) {
  const data = AXES.map(({ key, label }) => ({
    stat: label,
    value: Math.min(100, Math.round((stats[key] / AXIS_MAX) * 100)),
    raw: stats[key],
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#3a3d47" />
        <PolarAngleAxis dataKey="stat" tick={{ fill: "#9498a3", fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="value"
          stroke="#facc15"
          fill="#facc15"
          fillOpacity={0.28}
          isAnimationActive={false}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
