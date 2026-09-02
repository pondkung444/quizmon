"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getBossRaidLoadoutData, selectBossRaidPet, type BossRaidLoadoutData } from "../actions";
import type { EligibleRaidPet, RaidGearItemFull } from "@/lib/raid";
import RaidGearLoadout from "@/components/raid/RaidGearLoadout";

function rawStatSum(p: EligibleRaidPet): number {
  return p.rawStats.hp + p.rawStats.atk + p.rawStats.def + p.rawStats.spd + p.rawStats.foc;
}

// จอเลือก Qmon + ปรับอุปกรณ์ที่หน้ารอ boss raid (status='lobby' เท่านั้น — LobbyClient คุมการ mount)
// reuse ตัวโหลด + คอมโพเนนต์ loadout ชุดเดียวกับ "ตั้งค่าก่อนเข้าด่าน" ของระบบท้าทาย
// ต่างกันตรง: ไม่มีเกณฑ์ด่าน (ซ่อนเกจความพร้อม), เปลี่ยนตัว/ปรับของ = เรียก select_boss_raid_pet
// re-snapshot stat_snapshot ของ participant ทันที (server เป็นเจ้าของ state เสมอ)
export default function BossRaidLoadout({
  participantId,
  currentPetId,
}: {
  participantId: string;
  currentPetId: string;
}) {
  const [data, setData] = useState<BossRaidLoadoutData | null>(null);
  const [items, setItems] = useState<RaidGearItemFull[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBossRaidLoadoutData()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setItems(d.gear);
        setSelectedPetId(
          d.pets.some((p) => p.id === currentPetId) ? currentPetId : d.pets[0]?.id ?? null
        );
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("getBossRaidLoadoutData failed:", e);
          setData({ pets: [], gear: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPetId]);

  const sortedPets = useMemo(
    () => (data ? [...data.pets].sort((a, b) => rawStatSum(b) - rawStatSum(a)) : []),
    [data]
  );
  const selectedPet = data?.pets.find((p) => p.id === selectedPetId) ?? null;

  // re-snapshot stat_snapshot ของ participant ให้ตรงกับตัว + ของที่ใส่อยู่ตอนนี้
  async function reSnapshot(petId: string) {
    setBusy(true);
    setError(null);
    try {
      await selectBossRaidPet(participantId, petId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function pickPet(petId: string) {
    if (petId === selectedPetId || busy) return;
    setSelectedPetId(petId);
    setShowPicker(false);
    void reSnapshot(petId);
  }

  return (
    <section className="mt-4 rounded-2xl border border-gold-dim bg-card p-5">
      <h2 className="text-lg font-bold text-gold-hi">เลือก Qmon ลงสนาม</h2>
      <p className="mt-0.5 text-xs text-text3">
        เลือกตัว + ปรับอุปกรณ์ได้จนกว่าครูจะกดเริ่มเกม — สเตตัสจะคำนวณใหม่ทันที
      </p>

      {data == null ? (
        <p className="mt-3 text-sm text-text3">กำลังโหลด Qmon ของคุณ…</p>
      ) : data.pets.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-track p-3 text-sm text-text3">
          ยังไม่มี Qmon ที่โตเต็มวัย — ลงสนามด้วยร่างปัจจุบัน (สเตตัส 50 ทุกด้าน)
        </p>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-4">
          {selectedPet && (
            <div className="w-full max-w-xs">
              <p className="mb-2 text-xs text-text2">Qmon ที่จะลงสนาม</p>
              <div className="flex items-center gap-3 rounded-xl border border-gold bg-amber/10 p-3">
                <Image
                  src={selectedPet.imagePath}
                  alt={selectedPet.speciesName}
                  width={48}
                  height={48}
                  className="shrink-0"
                />
                <span className="flex-1 font-bold text-text">
                  {selectedPet.nickname ?? selectedPet.speciesName}
                </span>
                {data.pets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowPicker((v) => !v)}
                    className="shrink-0 text-xs text-text3 underline"
                  >
                    เปลี่ยนตัว
                  </button>
                )}
              </div>

              {showPicker && (
                <div className="mt-2 flex flex-col gap-2">
                  {sortedPets.map((pet) => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => pickPet(pet.id)}
                      disabled={busy}
                      aria-pressed={selectedPetId === pet.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                        selectedPetId === pet.id ? "border-gold bg-amber/10" : "border-border bg-card"
                      }`}
                    >
                      <Image
                        src={pet.imagePath}
                        alt={pet.speciesName}
                        width={40}
                        height={40}
                        className="shrink-0"
                      />
                      <span className="flex-1 font-bold text-text">
                        {pet.nickname ?? pet.speciesName}
                      </span>
                      <span className="shrink-0 text-xs text-text3">รวม {rawStatSum(pet)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedPet && (
            <RaidGearLoadout
              key={selectedPet.id}
              petId={selectedPet.id}
              rawStats={selectedPet.rawStats}
              caps={selectedPet.caps}
              thresholdPct={0}
              items={items}
              setItems={setItems}
              showReadiness={false}
              onAfterChange={() => void reSnapshot(selectedPet.id)}
            />
          )}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red">{error}</p>}
    </section>
  );
}
