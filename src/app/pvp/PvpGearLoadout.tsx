"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { RaidGearItemFull } from "@/lib/raid";
import { RAID_GEAR_SLOT_ANATOMY_TH, RAID_GEAR_QUALITY_COLOR } from "@/lib/raid/labels";
import { equipRaidGear, unequipRaidGear } from "@/app/raid/actions";
import RaidGearIcon from "@/components/raid/RaidGearIcon";
import RaidGearDrawer from "@/components/raid/RaidGearDrawer";
import type { PvpPetStats } from "@/lib/pvp/stats";
import { pvpGearBonus, type PvpGearStatKey } from "@/lib/pvp/gear";

const SLOTS: Array<"head" | "body" | "feet"> = ["head", "body", "feet"];
const EMPTY_ICON_COLOR = "#3a3d47";
const STAT_ROWS: Array<{ key: PvpGearStatKey; label: string }> = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "ตี" },
  { key: "def", label: "กัน" },
  { key: "spd", label: "เร็ว" },
];
const GEAR_BONUS_COLOR = "#34d399"; // เขียว (โทนเดียวกับ heal/success ในระบบเอฟเฟกต์)

// จอปรับอุปกรณ์ในโฟลว์ท้า/รับคำท้า — ใช้ raid_gear_items + equip/unequip RPC เดิม (ไม่มี RPC ใหม่)
// state ล้วนอยู่ที่นี่ (equip/unequip อัปเดต local `items` ตรง ๆ ไม่พึ่ง router.refresh)
// locked = Qmon ตัวนี้มีคำท้าค้าง/อยู่ในแมตช์ -> ปิดการปรับ (RPC ก็บล็อกอีกชั้น)
export default function PvpGearLoadout({
  petId,
  baseStats,
  items,
  setItems,
  locked,
}: {
  petId: string;
  baseStats: PvpPetStats;
  items: RaidGearItemFull[];
  setItems: Dispatch<SetStateAction<RaidGearItemFull[]>>;
  locked: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openSlot, setOpenSlot] = useState<"head" | "body" | "feet" | null>(null);

  const equippedBySlot = useMemo(() => {
    const map = new Map<"head" | "body" | "feet", RaidGearItemFull>();
    for (const item of items) if (item.equippedPetId === petId) map.set(item.slot, item);
    return map;
  }, [items, petId]);

  const inventoryBySlot = useMemo(() => {
    const map = new Map<"head" | "body" | "feet", RaidGearItemFull[]>();
    for (const slot of SLOTS) map.set(slot, []);
    for (const item of items) if (item.equippedPetId === null) map.get(item.slot)!.push(item);
    return map;
  }, [items]);

  const bonus = useMemo(() => pvpGearBonus(items, petId), [items, petId]);

  async function handleUnequip(item: RaidGearItemFull) {
    if (busyId || locked) return;
    setBusyId(item.id);
    setErrorMessage(null);
    try {
      const r = await unequipRaidGear(item.id);
      if (!r.ok) {
        setErrorMessage(r.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, equippedPetId: null } : i)));
    } finally {
      setBusyId(null);
    }
  }

  async function handleEquip(item: RaidGearItemFull) {
    if (busyId || locked) return;
    setBusyId(item.id);
    setErrorMessage(null);
    try {
      // ถอดของเดิมที่ชนช่อง/ชนแกนก่อน (เหมือน RaidGearLoadout)
      const conflicts = items.filter(
        (i) =>
          i.equippedPetId === petId &&
          i.id !== item.id &&
          (i.slot === item.slot || i.mainStat === item.mainStat)
      );
      for (const c of conflicts) {
        const ur = await unequipRaidGear(c.id);
        if (!ur.ok) {
          setErrorMessage(ur.message);
          return;
        }
        setItems((prev) => prev.map((i) => (i.id === c.id ? { ...i, equippedPetId: null } : i)));
      }
      const r = await equipRaidGear(item.id, petId);
      if (!r.ok) {
        setErrorMessage(r.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, equippedPetId: petId } : i)));
      setOpenSlot(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-track p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-text2">⚙️ อุปกรณ์ (จากท้าทาย)</p>
        {locked && <span className="text-[11px] text-text3">🔒 ปรับไม่ได้ตอนนี้</span>}
      </div>

      {/* 3 ช่อง */}
      <div className="mt-2 flex justify-center gap-4">
        {SLOTS.map((slot) => {
          const eq = equippedBySlot.get(slot);
          const color = eq ? RAID_GEAR_QUALITY_COLOR[eq.quality] ?? EMPTY_ICON_COLOR : EMPTY_ICON_COLOR;
          return (
            <button
              key={slot}
              type="button"
              disabled={locked}
              onClick={() => setOpenSlot(slot)}
              className={`flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2 transition active:scale-95 ${
                locked ? "opacity-50" : ""
              }`}
            >
              <RaidGearIcon slot={slot} color={color} size={36} />
              <span className="text-[10px] text-text3">{RAID_GEAR_SLOT_ANATOMY_TH[slot]}</span>
            </button>
          );
        })}
      </div>

      {/* preview สเตตัสรวมอุปกรณ์ */}
      <div className="mt-3 grid grid-cols-5 gap-1 text-center text-[10px]">
        {STAT_ROWS.map(({ key, label }) => (
          <span key={key} className="text-text3">
            {label} {baseStats[key]}
            {bonus[key] > 0 && (
              <span className="font-bold" style={{ color: GEAR_BONUS_COLOR }}>
                {" "}
                +{bonus[key]}
              </span>
            )}
          </span>
        ))}
        <span className="text-text3">คริ {baseStats.foc}</span>
      </div>

      {errorMessage && <p className="mt-2 text-xs text-red">{errorMessage}</p>}

      {openSlot && !locked && (
        <RaidGearDrawer
          slot={openSlot}
          equippedItem={equippedBySlot.get(openSlot) ?? null}
          inventoryItems={inventoryBySlot.get(openSlot) ?? []}
          busyId={busyId}
          onEquip={handleEquip}
          onUnequip={handleUnequip}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </div>
  );
}
