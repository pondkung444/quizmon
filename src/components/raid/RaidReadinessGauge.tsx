// เกจ % ความพร้อม เทียบ boss_threshold_pct ของด่านนั้น — ต่างจากเกจสะสม (gaugeEarned/gaugeMax ใน
// RaidPathScreen) ตรงที่มีขีดบอกตำแหน่งเกณฑ์บนแท่ง และสีทั้งแท่งขึ้นกับผ่าน/ไม่ผ่านเกณฑ์
export default function RaidReadinessGauge({ pct, thresholdPct }: { pct: number; thresholdPct: number }) {
  const isReady = pct >= thresholdPct;
  const fillPct = Math.max(0, Math.min(100, pct));
  const markerPct = Math.max(0, Math.min(100, thresholdPct));

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-text2">ความพร้อม</span>
        <span className={`font-bold ${isReady ? "text-green-400" : "text-red-500"}`}>
          {pct.toFixed(0)}% (ต้องการ {thresholdPct.toFixed(0)}%)
        </span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-track">
        <div
          className={`h-full rounded-full transition-all ${isReady ? "bg-green-400" : "bg-red-500"}`}
          style={{ width: `${fillPct}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-text"
          style={{ left: `${markerPct}%` }}
          title={`เกณฑ์ด่านนี้ ${thresholdPct.toFixed(0)}%`}
        />
      </div>
    </div>
  );
}
