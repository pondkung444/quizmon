"use client";

import type { RaidGearItemFull } from "@/lib/raid";
import { RAID_GEAR_QUALITY_COLOR } from "@/lib/raid/labels";
import type { RaidStatKey } from "@/lib/raid/stats";
import RaidGearIcon from "@/components/raid/RaidGearIcon";

const STAT_LABEL_TH: Record<RaidStatKey, string> = { hp: "HP", atk: "ATK", def: "DEF", spd: "SPD", foc: "FOC" };
const EMPTY_ICON_COLOR = "#3a3d47"; // --color-border

function gearLine(item: {
  mainStat: RaidStatKey;
  mainValue: number;
  subStat: RaidStatKey | null;
  subValue: number | null;
}) {
  const main = `${STAT_LABEL_TH[item.mainStat]}+${item.mainValue}`;
  const sub = item.subStat && item.subValue ? ` · ${STAT_LABEL_TH[item.subStat]}+${item.subValue}` : "";
  return main + sub;
}

// ดรอวเวอร์คลังต่อช่อง (§2.7) — เด้งเมื่อแตะไอคอนช่องใน RaidGearLoadout กรองเฉพาะไอเทม slot เดียวกัน
// เรียงจาก (main_value + sub_value) รวมมากไปน้อย กด "ใส่" ได้แม้ช่องนี้มีของอยู่แล้ว — ของเดิมที่ชนช่อง
// หรือชนแกน (mainStat) เดียวกันจะถูกถอดให้อัตโนมัติ (ดู handleEquip ใน RaidGearLoadout)
export default function RaidGearDrawer({
  slot,
  equippedItem,
  inventoryItems,
  busyId,
  onEquip,
  onUnequip,
  onClose,
}: {
  slot: "head" | "body" | "feet";
  equippedItem: RaidGearItemFull | null;
  inventoryItems: RaidGearItemFull[];
  busyId: string | null;
  onEquip: (item: RaidGearItemFull) => void;
  onUnequip: (item: RaidGearItemFull) => void;
  onClose: () => void;
}) {
  const sorted = [...inventoryItems].sort(
    (a, b) => b.mainValue + (b.subValue ?? 0) - (a.mainValue + (a.subValue ?? 0))
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xs flex-col gap-3 overflow-y-auto rounded-t-2xl border border-gold-dim bg-card p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gold-hi">เลือกอุปกรณ์</p>
          <button type="button" onClick={onClose} className="text-xs text-text3 underline">
            ปิด
          </button>
        </div>

        {equippedItem && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-gold bg-amber/10 p-2">
            <div className="flex items-center gap-2">
              <RaidGearIcon slot={slot} color={RAID_GEAR_QUALITY_COLOR[equippedItem.quality] ?? EMPTY_ICON_COLOR} size={32} />
              <p className="text-sm text-text">
                <span className="font-bold">{equippedItem.qualityLabel ?? equippedItem.quality}</span>{" "}
                <span className="text-text3">{gearLine(equippedItem)}</span>
              </p>
            </div>
            <button
              type="button"
              disabled={busyId === equippedItem.id}
              onClick={() => onUnequip(equippedItem)}
              className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-text3 transition active:scale-95 disabled:opacity-50"
            >
              ถอด
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {sorted.length === 0 && !equippedItem && (
            <p className="py-4 text-center text-sm text-text3">ยังไม่มีของช่องนี้ในคลัง</p>
          )}
          {sorted.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-track p-2"
            >
              <div className="flex items-center gap-2">
                <RaidGearIcon slot={slot} color={RAID_GEAR_QUALITY_COLOR[item.quality] ?? EMPTY_ICON_COLOR} size={32} />
                <p className="text-sm text-text">
                  <span className="font-bold">{item.qualityLabel ?? item.quality}</span>{" "}
                  <span className="text-text3">{gearLine(item)}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === item.id}
                onClick={() => onEquip(item)}
                title={equippedItem ? "จะถอดของเดิมออกให้อัตโนมัติ" : undefined}
                className="shrink-0 rounded-lg border border-gold px-2 py-1 text-xs text-gold-hi transition active:scale-95 disabled:opacity-50"
              >
                ใส่
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
