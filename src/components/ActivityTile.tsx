import type { ReactNode } from "react";

// ไทล์สีในส่วน "กิจกรรม" หน้า /pet (ท้าทาย / ป้อนอาหาร / สถิติ) — ขนาดเท่ากัน วางใน grid เดียวกัน
// สีมาจาก --pet-tile-* (globals.css) ที่ธีมแอปสลับให้ ต้อง min-w-0 เสมอ ไม่งั้นข้อความยาวดันหน้ากว้างเกินจอ
export type ActivityTileKind = "raid" | "food" | "stats";

const KIND_CLASS: Record<ActivityTileKind, string> = {
  raid: "bg-(--pet-tile-raid-bg) text-(--pet-tile-raid-text)",
  food: "bg-(--pet-tile-food-bg) text-(--pet-tile-food-text)",
  stats: "bg-(--pet-tile-stats-bg) text-(--pet-tile-stats-text)",
};

export function activityTileClass(kind: ActivityTileKind): string {
  return `relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center shadow-md transition active:scale-95 ${KIND_CLASS[kind]}`;
}

export function ActivityTileContent({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/60 text-xl" aria-hidden>
        {icon}
      </span>
      <span className="text-sm font-bold leading-tight">{title}</span>
      <span className="block max-w-full truncate text-[11px] opacity-90">{subtitle}</span>
    </>
  );
}
