"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { RaidGearItemFull } from "@/lib/raid";
import {
  effectiveStat,
  computeGearContributions,
  totalPct,
  type EquippedGearForStats,
  type RaidStatKey,
  type RaidStatRecord,
} from "@/lib/raid/stats";
import { RAID_GEAR_SLOT_ANATOMY_TH, RAID_GEAR_QUALITY_COLOR } from "@/lib/raid/labels";
import { equipRaidGear, unequipRaidGear } from "@/app/raid/actions";
import RaidGearIcon from "@/components/raid/RaidGearIcon";
import RaidGearDrawer from "@/components/raid/RaidGearDrawer";
import RaidStatRadar from "@/components/raid/RaidStatRadar";
import RaidReadinessGauge from "@/components/raid/RaidReadinessGauge";
import Toast from "@/components/social/Toast";

const STAT_LABEL_TH: Record<RaidStatKey, string> = { hp: "HP", atk: "ATK", def: "DEF", spd: "SPD", foc: "FOC" };
const SLOTS: Array<"head" | "body" | "feet"> = ["head", "body", "feet"];
const EMPTY_ICON_COLOR = "#3a3d47"; // --color-border — โทนมิวต์สำหรับช่องว่าง (ไม่ใช่สีคุณภาพ)

// จอ "ยืนยัน/ปรับ loadout" ก่อนออกท้าทาย (v3 §6.3, raid-slice2-ui-handoff §2) — state ล้วนอยู่ในนี้
// ไม่พึ่ง router.refresh() เลย (equip/unequip อัปเดต local state ตรงๆ) เลขที่โชว์เป็นแค่ preview
// readiness (effectiveStat ฝั่ง TS) ตัวตัดสินผ่าน/ไม่ผ่านจริงมาจาก stat_snapshot ที่ start_raid_run
// ล็อกตอนกดออกเดินทาง — ไม่ต้อง disable ปุ่ม equip/unequip เชิงรุกที่นี่เพราะจอนี้เข้าถึงได้เฉพาะตอน
// ไม่มีรอบ raid ค้างอยู่เท่านั้น (raid/page.tsx เด้งไปจอ active run แทนถ้ามีรอบค้าง) — RPC เดิมยังบล็อก
// เผื่อ race condition อยู่ดี
export default function RaidGearLoadout({
  petId,
  rawStats,
  caps,
  thresholdPct,
  items,
  setItems,
  showReadiness = true,
  onAfterChange,
}: {
  petId: string;
  rawStats: RaidStatRecord;
  caps: RaidStatRecord;
  thresholdPct: number;
  items: RaidGearItemFull[];
  setItems: Dispatch<SetStateAction<RaidGearItemFull[]>>;
  // Boss Raid ไม่มีเกณฑ์ด่าน — ซ่อนเกจความพร้อม, และ re-snapshot ผ่าน onAfterChange หลัง equip/unequip
  showReadiness?: boolean;
  onAfterChange?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [openSlot, setOpenSlot] = useState<"head" | "body" | "feet" | null>(null);

  const equippedBySlot = useMemo(() => {
    const map = new Map<"head" | "body" | "feet", RaidGearItemFull>();
    for (const item of items) {
      if (item.equippedPetId === petId) map.set(item.slot, item);
    }
    return map;
  }, [items, petId]);

  const inventoryBySlot = useMemo(() => {
    const map = new Map<"head" | "body" | "feet", RaidGearItemFull[]>();
    for (const slot of SLOTS) map.set(slot, []);
    for (const item of items) {
      if (item.equippedPetId === null) map.get(item.slot)!.push(item);
    }
    return map;
  }, [items]);

  const equippedForStats: EquippedGearForStats[] = useMemo(
    () =>
      SLOTS.filter((s) => equippedBySlot.has(s)).map((s) => {
        const g = equippedBySlot.get(s)!;
        return {
          slot: g.slot,
          qualityLabel: g.qualityLabel,
          mainStat: g.mainStat as EquippedGearForStats["mainStat"],
          mainValue: g.mainValue,
          subStat: g.subStat as EquippedGearForStats["subStat"],
          subValue: g.subValue,
        };
      }),
    [equippedBySlot]
  );

  const petForStats = {
    stat_hp: rawStats.hp,
    stat_atk: rawStats.atk,
    stat_def: rawStats.def,
    stat_spd: rawStats.spd,
    stat_foc: rawStats.foc,
  };

  const effective: RaidStatRecord = {
    hp: effectiveStat(petForStats, "hp", caps, equippedForStats),
    atk: effectiveStat(petForStats, "atk", caps, equippedForStats),
    def: effectiveStat(petForStats, "def", caps, equippedForStats),
    spd: effectiveStat(petForStats, "spd", caps, equippedForStats),
    foc: effectiveStat(petForStats, "foc", caps, equippedForStats),
  };

  const readinessPct = totalPct(effective);

  const overflowRows = useMemo(
    () => computeGearContributions(petForStats, caps, equippedForStats).filter((r) => r.overflow > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [equippedForStats]
  );

  async function handleUnequip(item: RaidGearItemFull) {
    if (busyId) return;
    setBusyId(item.id);
    setErrorMessage(null);
    try {
      const result = await unequipRaidGear(item.id);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, equippedPetId: null } : i)));
      onAfterChange?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ถอดอุปกรณ์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function handleEquip(item: RaidGearItemFull) {
    if (busyId) return;
    setBusyId(item.id);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      // ของเดิมที่ชนช่องเดียวกันหรือชนแกน (mainStat) เดียวกันบนตัวนี้ — ถอดให้อัตโนมัติก่อนใส่ของใหม่
      const conflicts = items.filter(
        (i) => i.equippedPetId === petId && i.id !== item.id && (i.slot === item.slot || i.mainStat === item.mainStat)
      );
      const unequippedNotes: string[] = [];
      for (const conflict of conflicts) {
        const unequipResult = await unequipRaidGear(conflict.id);
        if (!unequipResult.ok) {
          setErrorMessage(unequipResult.message);
          return;
        }
        setItems((prev) => prev.map((i) => (i.id === conflict.id ? { ...i, equippedPetId: null } : i)));
        const reason = conflict.slot === item.slot ? "slot ซ้ำกัน" : `แกน ${STAT_LABEL_TH[conflict.mainStat]} ซ้ำกัน`;
        unequippedNotes.push(`${conflict.qualityLabel ?? conflict.quality} (${reason})`);
      }

      const result = await equipRaidGear(item.id, petId);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, equippedPetId: petId } : i)));
      onAfterChange?.();
      setOpenSlot(null);
      if (unequippedNotes.length > 0) {
        setInfoMessage(`ถอด ${unequippedNotes.join(", ")} ออกอัตโนมัติ`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ใส่อุปกรณ์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="w-full max-w-xs rounded-2xl border border-gold-dim bg-track p-3">
      <p className="mb-2 text-xs font-bold text-text2">อุปกรณ์</p>

      <RaidStatRadar raw={rawStats} effective={effective} caps={caps} />

      {showReadiness && (
        <div className="mt-2">
          <RaidReadinessGauge pct={readinessPct} thresholdPct={thresholdPct} />
        </div>
      )}

      <div className="mt-3 flex justify-center gap-4">
        {SLOTS.map((slot) => {
          const equipped = equippedBySlot.get(slot);
          const color = equipped ? RAID_GEAR_QUALITY_COLOR[equipped.quality] ?? EMPTY_ICON_COLOR : EMPTY_ICON_COLOR;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => setOpenSlot(slot)}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2 transition active:scale-95"
            >
              <RaidGearIcon slot={slot} color={color} size={40} />
              <span className="text-[10px] text-text3">{RAID_GEAR_SLOT_ANATOMY_TH[slot]}</span>
            </button>
          );
        })}
      </div>

      {overflowRows.length > 0 && (
        <div className="mt-2 rounded-xl border border-border bg-card p-2 text-xs text-text3">
          {overflowRows.map((row, i) => (
            <p key={i}>
              {STAT_LABEL_TH[row.stat]} ล้น +{row.overflow} (คุมที่ cap {caps[row.stat]} แล้ว)
            </p>
          ))}
        </div>
      )}

      {errorMessage && <p className="mt-2 text-xs text-red">{errorMessage}</p>}

      {infoMessage && <Toast message={infoMessage} onDone={() => setInfoMessage(null)} />}

      {openSlot && (
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
    </section>
  );
}
