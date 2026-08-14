"use client";

export type SegmentedTab = { key: string; label: string };

// ตัว tab switcher เปล่า ๆ ไม่ผูก routing/state ในตัวเอง — หน้าที่เรียกใช้ (collection/eggs
// ใช้ route คนละหน้า, social ใช้ query param) จัดการ activeKey/onChange เอง
export default function SegmentedTabs({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: SegmentedTab[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="sticky top-0 z-30 flex gap-1 rounded-xl border border-gold-dim bg-card p-1.5 shadow-md">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm font-bold transition active:scale-95 ${
              active ? "bg-amber/15 text-amber" : "text-text3"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
