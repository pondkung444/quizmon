"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RaidTypeInfo, EligibleRaidPet, RaidGearItemFull } from "@/lib/raid";
import { startRaidRun } from "@/app/raid/actions";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import RaidScene from "@/components/raid/RaidScene";
import RaidGearLoadout from "@/components/raid/RaidGearLoadout";
import { RAID_MOUNTAIN_NAME_TH, RAID_GEAR_SLOT_ANATOMY_TH } from "@/lib/raid/labels";

const SLOTS: Array<"head" | "body" | "feet"> = ["head", "body", "feet"];

function rawStatSum(pet: EligibleRaidPet): number {
  return pet.rawStats.hp + pet.rawStats.atk + pet.rawStats.def + pet.rawStats.spd + pet.rawStats.foc;
}

// จอ "ตั้งค่าก่อนเข้าด่าน" หน้าเดียว (raid-slice2-ui-handoff §2) — รวมเลือกมอน + เลือกอุปกรณ์ + ดูสเตตัส
// ไม่แยกเป็น 3 หน้าตามที่เคยคิดไว้ก่อนคุย UX จบ — ต้องเขียนกติกาบอสเป็นข้อความตรงๆ (§7 ในดอคเดิม) กัน
// สภาพ "แพ้เพราะเงื่อนไขที่ไม่รู้มาก่อน" แต่ยุบเป็น expand แทนบล็อกเปิดค้าง (§2.8 ในดอคใหม่)
export default function RaidPreDeparture({
  raidType,
  pets,
  ticketCount,
  preselectedPetId,
  gearItems,
}: {
  raidType: RaidTypeInfo;
  pets: EligibleRaidPet[];
  ticketCount: number;
  preselectedPetId?: string | null;
  gearItems: RaidGearItemFull[];
}) {
  const router = useRouter();
  // มาจาก /collection/[petId] ด้วย ?pet= ที่ผ่านการเช็คสิทธิ์แล้วฝั่ง server (page.tsx) — ล็อกตัวไว้
  // ไม่ต้องเลือกซ้ำ แต่ต้องมีทาง "เปลี่ยนตัว" กลับไปจอปกติเสมอ (แค่ทิ้ง ?pet= ไม่ใช่ path พิเศษ) จึงเป็น
  // Link ไม่ใช่ toggle picker แบบตัวที่เลือกเอง
  const lockedPet = preselectedPetId ? pets.find((p) => p.id === preselectedPetId) ?? null : null;

  const [selectedPetId, setSelectedPetId] = useState<string | null>(
    preselectedPetId ?? pets[0]?.id ?? null
  );
  const selectedPet = pets.find((p) => p.id === selectedPetId) ?? null;
  const [showPicker, setShowPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState(gearItems);
  const [showGearWarning, setShowGearWarning] = useState(false);

  // ช่องที่ยังว่างและมีของชนิดตรงช่องนั้นค้างในคลัง (ไม่ได้ใส่กับตัวไหน) — เตือนก่อนเข้าด่านเท่านั้น
  // ไม่บล็อก และไม่เตือนถ้าคลังไม่มีของให้ใส่จริงๆ (ยืนยันคำ 11 ส.ค.)
  const missingEquippableSlots = useMemo(() => {
    if (!selectedPet) return [];
    const equippedSlots = new Set(
      items.filter((i) => i.equippedPetId === selectedPet.id).map((i) => i.slot)
    );
    return SLOTS.filter(
      (slot) =>
        !equippedSlots.has(slot) &&
        items.some((i) => i.equippedPetId === null && i.slot === slot)
    );
  }, [items, selectedPet]);

  // เรียงจาก stat รวม raw มากไปน้อย (§2.3, §7) — ใช้ raw ไม่ใช่ effective เพราะเป็นการเลือกตัวมอน
  // โดยเนื้อแท้ ไม่เกี่ยวกับของที่ใส่อยู่
  const sortedPets = [...pets].sort((a, b) => rawStatSum(b) - rawStatSum(a));

  async function handleDepart() {
    if (!selectedPetId || isSending || ticketCount === 0) return;
    setIsSending(true);
    setErrorMessage(null);
    try {
      await startRaidRun(selectedPetId, raidType.id);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "เริ่มการท้าทายไม่สำเร็จ");
      setIsSending(false);
    }
  }

  function handleDepartClick() {
    if (missingEquippableSlots.length > 0) {
      setShowGearWarning(true);
      return;
    }
    handleDepart();
  }

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader
        title={`${RAID_MOUNTAIN_NAME_TH} · ${raidType.nameTh}`}
        subtitle={raidType.descriptionTh ?? undefined}
      />
      <p className="-mt-2 text-xs text-text3">
        {raidType.nameTh} → ตั้งค่าก่อนเข้าด่าน
      </p>

      <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-5">
        <RaidScene backgroundPath={raidType.backgroundPath} />

        <section className="w-full max-w-xs rounded-xl border border-border bg-track px-3 py-2 text-center">
          <p className="text-xs text-text2">กุญแจท้าทายคงเหลือ</p>
          <p className="text-lg font-bold text-gold-hi">{ticketCount} ดอก</p>
        </section>

        <section className="w-full max-w-xs">
          {pets.length === 0 ? (
            <p className="rounded-xl border border-border bg-track p-3 text-center text-sm text-text3">
              ยังไม่มี Qmon ที่โตเต็มที่พร้อมท้าทาย
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-text2">Qmon ที่จะไป</p>
              {selectedPet && (
                <div className="flex items-center gap-3 rounded-xl border border-gold bg-amber/10 p-3">
                  <Image
                    src={selectedPet.imagePath}
                    alt={selectedPet.speciesName}
                    width={48}
                    height={48}
                    className="shrink-0"
                  />
                  <span className="font-sarabun flex-1 font-bold text-text">{selectedPet.nickname ?? selectedPet.speciesName}</span>
                  {lockedPet ? (
                    <Link href="/raid" className="shrink-0 text-xs text-text3 underline">
                      เปลี่ยนตัว
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPicker((v) => !v)}
                      className="shrink-0 text-xs text-text3 underline"
                    >
                      เปลี่ยนตัว
                    </button>
                  )}
                </div>
              )}

              {!lockedPet && showPicker && (
                <div className="mt-2 flex flex-col gap-2">
                  {sortedPets.map((pet) => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => {
                        setSelectedPetId(pet.id);
                        setShowPicker(false);
                      }}
                      aria-pressed={selectedPetId === pet.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                        selectedPetId === pet.id ? "border-gold bg-amber/10" : "border-border bg-card"
                      }`}
                    >
                      <Image src={pet.imagePath} alt={pet.speciesName} width={48} height={48} className="shrink-0" />
                      <span className="font-sarabun font-bold text-text">{pet.nickname ?? pet.speciesName}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {selectedPet && (
          <RaidGearLoadout
            key={selectedPet.id}
            petId={selectedPet.id}
            rawStats={selectedPet.rawStats}
            caps={selectedPet.caps}
            thresholdPct={raidType.bossThresholdPct}
            items={items}
            setItems={setItems}
          />
        )}

        <section className="w-full max-w-xs rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-sm font-bold text-text">ผ่านหรือไม่ผ่าน ก็ได้อุปกรณ์ติดมือกลับมาเสมอ</p>
        </section>

        {errorMessage && <p className="w-full max-w-xs text-center text-sm text-red">{errorMessage}</p>}

        <button
          type="button"
          disabled={!selectedPetId || isSending || ticketCount === 0}
          onClick={handleDepartClick}
          className="w-full max-w-xs rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {isSending ? "กำลังเริ่ม..." : ticketCount === 0 ? "ไม่มีกุญแจท้าทาย" : "ใช้กุญแจเริ่มท้าทาย"}
        </button>

        <details className="w-full max-w-xs text-center">
          <summary className="cursor-pointer text-xs text-text3 underline">ดูกติกาบอส</summary>
          <p className="mt-2 text-sm text-text">
            ต้องตอบคำถามให้ถูกอย่างน้อย {raidType.bossPassCount} ใน {raidType.bossQuestionCount} ข้อ
            และสถิติรวมของ Qmon ต้องถึงเกณฑ์ด่านนี้ — พลาดข้อไหนก็ไปต่อได้เสมอ ไม่มีทางตัน
          </p>
        </details>
      </div>

      {showGearWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xs rounded-2xl border border-gold-dim bg-card p-5">
            <p className="font-sarabun mb-2 text-base font-bold text-text">มีอุปกรณ์ที่ยังไม่ได้ใส่</p>
            <p className="mb-4 text-sm text-text2">
              Qmon ตัวนี้ยังมีของว่าง{" "}
              {missingEquippableSlots.map((s) => RAID_GEAR_SLOT_ANATOMY_TH[s]).join(" และ ")}{" "}
              อยู่ในคลัง ใส่ก่อนได้เกจพร้อมกว่านี้
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowGearWarning(false)}
                className="w-full rounded-xl border border-gold bg-amber py-2.5 text-sm font-bold text-track"
              >
                กลับไปใส่อุปกรณ์
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowGearWarning(false);
                  handleDepart();
                }}
                className="w-full rounded-xl border border-border py-2.5 text-sm text-text2"
              >
                ลุยต่อโดยไม่ใส่
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
