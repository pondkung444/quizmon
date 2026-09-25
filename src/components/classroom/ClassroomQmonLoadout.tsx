"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, Sprout } from "lucide-react";
import { getBossRaidLoadoutData, type BossRaidLoadoutData } from "@/app/boss-raid/actions";
import { setClassroomPet } from "@/app/classroom/actions";
import type { EligibleRaidPet, RaidGearItemFull } from "@/lib/raid";
import RaidGearLoadout from "@/components/raid/RaidGearLoadout";

function rawStatSum(p: EligibleRaidPet): number {
  return p.rawStats.hp + p.rawStats.atk + p.rawStats.def + p.rawStats.spd + p.rawStats.foc;
}

// เลือก Qmon ประจำคาบ + ใส่อุปกรณ์ ที่หน้าห้องนักเรียน — ตัวที่เลือกจะลง Boss Raid ที่ครูเปิดจากคาบนี้
// (join_boss_raid_session อ่าน classroom_participants.pet_id) อุปกรณ์ผูกกับตัว Qmon เอง จึงติดไปทุกโหมด
// reuse ตัวโหลด + RaidGearLoadout ชุดเดียวกับหน้ารอ Boss Raid (BossRaidLoadout.tsx)
// ไม่ห่อด้วย BottomSheet: RaidGearDrawer เป็น position:fixed — อยู่ใต้ parent ที่มี transform แล้วตำแหน่งเพี้ยน
export default function ClassroomQmonLoadout({
  sessionId,
  chosenPetId,
  onChanged,
}: {
  sessionId: string;
  /** classroom_participants.pet_id — null = ใช้ตัวที่เลี้ยงอยู่ */
  chosenPetId: string | null;
  onChanged: () => void;
}) {
  const [data, setData] = useState<BossRaidLoadoutData | null>(null);
  const [items, setItems] = useState<RaidGearItemFull[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(chosenPetId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBossRaidLoadoutData()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setItems(d.gear);
      })
      .catch((e) => {
        console.error("getBossRaidLoadoutData failed:", e);
        if (!cancelled) setData({ pets: [], gear: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pets = useMemo(
    () => (data ? [...data.pets].sort((a, b) => rawStatSum(b) - rawStatSum(a)) : []),
    [data]
  );
  const selected = pets.find((p) => p.id === selectedId) ?? null;

  async function pick(petId: string | null) {
    if (busy || petId === selectedId) return;
    const prev = selectedId;
    setSelectedId(petId);
    setBusy(true);
    setError(null);
    try {
      await setClassroomPet(sessionId, petId);
      onChanged();
    } catch (e) {
      setSelectedId(prev);
      setError(e instanceof Error ? e.message : "เปลี่ยน Qmon ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (data === null) {
    return <p className="py-6 text-center text-sm text-text3">กำลังโหลด Qmon ของคุณ…</p>;
  }

  return (
    <div>
      <p className="text-xs text-text3">
        ตัวที่เลือกจะลงสนามเมื่อครูเปิด Boss Raid · อุปกรณ์ติดตัว Qmon ไปทุกโหมด
      </p>

      <div className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        <PetChoice
          active={selectedId === null}
          disabled={busy}
          onClick={() => void pick(null)}
          label="ตัวที่เลี้ยงอยู่"
          sub="ค่าเริ่มต้น"
        >
          <Sprout className="h-8 w-8 text-good" />
        </PetChoice>
        {pets.map((p) => (
          <PetChoice
            key={p.id}
            active={selectedId === p.id}
            disabled={busy}
            onClick={() => void pick(p.id)}
            label={p.nickname ?? p.speciesName}
            sub={`รวม ${rawStatSum(p)}`}
          >
            <div className="relative h-14 w-14">
              <Image src={p.imagePath} alt={p.speciesName} fill sizes="56px" className="object-contain" />
            </div>
          </PetChoice>
        ))}
      </div>

      {pets.length === 0 && (
        <p className="mt-3 rounded-xl border border-border bg-track p-3 text-sm text-text3">
          ยังไม่มี Qmon ที่โตเต็มวัย — เลี้ยงให้ถึงร่างสมบูรณ์เพื่อเลือกลงสนามและใส่อุปกรณ์ได้
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red">{error}</p>}

      {selected ? (
        <div className="mt-4 flex justify-center">
          <RaidGearLoadout
            key={selected.id}
            petId={selected.id}
            rawStats={selected.rawStats}
            caps={selected.caps}
            thresholdPct={0}
            items={items}
            setItems={setItems}
            showReadiness={false}
          />
        </div>
      ) : (
        pets.length > 0 && (
          <p className="mt-3 text-center text-xs text-text3">เลือก Qmon ที่โตเต็มวัยเพื่อใส่อุปกรณ์</p>
        )
      )}
    </div>
  );
}

function PetChoice({
  active,
  disabled,
  onClick,
  label,
  sub,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`relative flex w-24 shrink-0 snap-start flex-col items-center rounded-2xl border px-2 pb-2 pt-3 transition active:scale-95 disabled:opacity-60 ${
        active ? "border-gold bg-amber/15" : "border-border bg-track"
      }`}
    >
      {active && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-on-amber">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <div className="flex h-14 w-14 items-center justify-center">{children}</div>
      <span className="mt-1.5 line-clamp-1 w-full text-center text-xs font-bold text-text">{label}</span>
      <span className="text-[10px] text-text3">{sub}</span>
    </button>
  );
}
