// รูปดาว 4 แฉก (ตามต้นแบบ) + gradient สีธาตุ — สีมาจาก --stardust-el-a/b ของ .sd[data-element]
export const STAR_PATH =
  "M0,-10 C1.6,-2.2 2.2,-1.6 10,0 C2.2,1.6 1.6,2.2 0,10 C-1.6,2.2 -2.2,1.6 -10,0 C-2.2,-1.6 -1.6,-2.2 0,-10Z";

export function ElementGradient({ id }: { id: string }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--stardust-el-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--stardust-el-b)" }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ไอคอนดาวเล็ก (ป้าย +EXP)
export function StarIcon({ gradientId, className }: { gradientId: string; className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden focusable="false">
      <path d={STAR_PATH} fill={`url(#${gradientId})`} />
    </svg>
  );
}

// รอยร้าวบนไข่ — n = จำนวนช่องที่ร้าว (0–5)
const CRACKS = ["M13 2 L11 8 L14 11", "M14 11 L10 15", "M14 11 L18 16", "M10 15 L8 21", "M18 16 L17 22"];
export function EggCracks({ n, className }: { n: number; className?: string }) {
  return (
    <svg viewBox="0 0 26 26" className={className} aria-hidden focusable="false">
      {CRACKS.slice(0, Math.max(0, n)).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
