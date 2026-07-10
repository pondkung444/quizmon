const RADAR_MAX = 120;
const RADAR_AXES = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "ATK" },
  { key: "def", label: "DEF" },
  { key: "spd", label: "SPD" },
  { key: "foc", label: "FOC" },
] as const;

function radarPoint(index: number, ratio: number, radius: number, cx: number, cy: number) {
  const angle = -90 + index * 72;
  const rad = (angle * Math.PI) / 180;
  const r = radius * ratio;
  return `${cx + r * Math.cos(rad)},${cy + r * Math.sin(rad)}`;
}

export default function StatRadar({
  stats,
}: {
  stats: { hp: number; atk: number; def: number; spd: number; foc: number } | null;
}) {
  const cx = 100;
  const cy = 100;
  const radius = 78;
  const rings = [0.33, 0.66, 1];

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[220px]">
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={RADAR_AXES.map((_, i) => radarPoint(i, ring, radius, cx, cy)).join(" ")}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={1}
        />
      ))}
      {RADAR_AXES.map((axis, i) => {
        const [x, y] = radarPoint(i, 1, radius, cx, cy).split(",").map(Number);
        return (
          <line key={axis.key} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth={1} />
        );
      })}
      {stats && (
        <polygon
          points={RADAR_AXES.map((axis, i) =>
            radarPoint(i, Math.min(1, stats[axis.key] / RADAR_MAX), radius, cx, cy)
          ).join(" ")}
          fill="var(--color-amber)"
          fillOpacity={0.35}
          stroke="var(--color-amber)"
          strokeWidth={2}
        />
      )}
      {RADAR_AXES.map((axis, i) => {
        const [x, y] = radarPoint(i, 1.18, radius, cx, cy).split(",").map(Number);
        return (
          <text
            key={axis.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fill="var(--color-text2)"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
