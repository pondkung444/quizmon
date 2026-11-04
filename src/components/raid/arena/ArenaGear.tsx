"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { RaidGearItemFull } from "@/lib/raid";
import { equipRaidGear, unequipRaidGear } from "@/app/raid/actions";
import { RAID_GEAR_QUALITY_COLOR, RAID_GEAR_SLOT_ANATOMY_TH } from "@/lib/raid/labels";
import RaidGearDrawer from "../RaidGearDrawer";
import RaidGearIcon from "../RaidGearIcon";
import styles from "./select.module.css";

type Slot = "head" | "body" | "feet";
const SLOTS: Slot[] = ["head", "body", "feet"];

// Three slots in the prep layout. Equipping works like RaidGearLoadout (auto-remove the item in the
// same slot or on the same main stat) but without the radar or readiness gauge.
export default function ArenaGear({ petId, items, setItems }: {
  petId: string;
  items: RaidGearItemFull[];
  setItems: Dispatch<SetStateAction<RaidGearItemFull[]>>;
}) {
  const [open, setOpen] = useState<Slot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const worn = (slot: Slot) => items.find((i) => i.equippedPetId === petId && i.slot === slot) ?? null;
  const stock = (slot: Slot) => items.filter((i) => i.equippedPetId === null && i.slot === slot);
  const setWorn = (id: string, pet: string | null) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, equippedPetId: pet } : i)));

  async function unequip(item: RaidGearItemFull) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const r = await unequipRaidGear(item.id);
      if (!r.ok) return setError(r.message);
      setWorn(item.id, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ถอดอุปกรณ์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function equip(item: RaidGearItemFull) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    setInfo(null);
    try {
      const conflicts = items.filter((i) => i.equippedPetId === petId && i.id !== item.id && (i.slot === item.slot || i.mainStat === item.mainStat));
      const removed: string[] = [];
      for (const c of conflicts) {
        const r = await unequipRaidGear(c.id);
        if (!r.ok) return setError(r.message);
        setWorn(c.id, null);
        removed.push(`${RAID_GEAR_SLOT_ANATOMY_TH[c.slot]} ${c.qualityLabel ?? c.quality}`);
      }
      const r = await equipRaidGear(item.id, petId);
      if (!r.ok) return setError(r.message);
      setWorn(item.id, petId);
      setOpen(null);
      if (removed.length) setInfo(`ถอด${removed.join(", ")}ออกให้แล้ว`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ใส่อุปกรณ์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return <>
    <div className={styles.gear}>
      {SLOTS.map((slot) => {
        const g = worn(slot);
        const n = stock(slot).length;
        return <button key={slot} type="button" className={styles.slot} onClick={() => setOpen(slot)}
          aria-label={`${RAID_GEAR_SLOT_ANATOMY_TH[slot]} ${g ? "เปลี่ยนอุปกรณ์" : "ใส่อุปกรณ์"}`}>
          {g
            ? <span className={styles.gem} style={{ background: RAID_GEAR_QUALITY_COLOR[g.quality] }}><RaidGearIcon slot={slot} color="#ffffff" size={24} /></span>
            : <span className={`${styles.gem} ${styles.gemEmpty}`}>+</span>}
          <b>{RAID_GEAR_SLOT_ANATOMY_TH[slot]}</b>
          {g ? `${g.mainStat.toUpperCase()} +${g.mainValue}` : n ? `มีของ ${n} ชิ้น` : "ยังว่าง"}
        </button>;
      })}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {info && <p className={styles.info} role="status">{info}</p>}
    {open && <RaidGearDrawer slot={open} equippedItem={worn(open)} inventoryItems={stock(open)} busyId={busyId}
      onEquip={equip} onUnequip={unequip} onClose={() => setOpen(null)} />}
  </>;
}
