"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RaidTypeInfo, EligibleRaidPet } from "@/lib/raid";
import { startRaidRun } from "@/app/raid/actions";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import RaidScene from "@/components/raid/RaidScene";
import { RAID_MOUNTAIN_NAME_TH } from "@/lib/raid/labels";

// จอก่อนใช้ตั๋ว — ต้องเขียนกติกาบอสเป็นข้อความตรงๆ (§7 ในดอค) กันสภาพ "แพ้เพราะเงื่อนไขที่ไม่รู้มาก่อน"
export default function RaidPreDeparture({
  raidType,
  pets,
  ticketCount,
  preselectedPetId,
}: {
  raidType: RaidTypeInfo;
  pets: EligibleRaidPet[];
  ticketCount: number;
  preselectedPetId?: string | null;
}) {
  const router = useRouter();
  const [selectedPetId, setSelectedPetId] = useState<string | null>(
    preselectedPetId ?? pets[0]?.id ?? null
  );
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // มาจาก /collection/[petId] ด้วย ?pet= ที่ผ่านการเช็คสิทธิ์แล้วฝั่ง server (page.tsx) — ล็อกตัวไว้
  // ไม่ต้องเลือกซ้ำ แต่ต้องมีทาง "เลือกตัวอื่น" กลับไปจอปกติเสมอ (แค่ทิ้ง ?pet= ไม่ใช่ path พิเศษ)
  const lockedPet = preselectedPetId ? pets.find((p) => p.id === preselectedPetId) ?? null : null;

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

  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader
        title={`${RAID_MOUNTAIN_NAME_TH} · ${raidType.nameTh}`}
        subtitle={raidType.descriptionTh ?? undefined}
      />

      <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-5">
        <RaidScene backgroundPath={raidType.backgroundPath} />

        <section className="w-full max-w-xs rounded-xl border border-border bg-track px-3 py-2 text-center">
          <p className="text-xs text-text2">ตั๋วท้าทายคงเหลือ</p>
          <p className="text-lg font-bold text-gold-hi">{ticketCount} ใบ</p>
        </section>

        <section className="w-full max-w-xs">
          {lockedPet ? (
            <>
              <p className="mb-2 text-xs text-text2">Qmon ที่จะไป</p>
              <div className="flex items-center gap-3 rounded-xl border border-gold bg-amber/10 p-3">
                <Image
                  src={lockedPet.imagePath}
                  alt={lockedPet.speciesName}
                  width={48}
                  height={48}
                  className="shrink-0"
                />
                <span className="font-bold text-text">{lockedPet.speciesName}</span>
              </div>
              <Link href="/raid" className="mt-2 inline-block text-xs text-text3 underline">
                เลือกตัวอื่น
              </Link>
            </>
          ) : (
            <>
              <p className="mb-2 text-xs text-text2">เลือกตัว</p>
              {pets.length === 0 ? (
                <p className="rounded-xl border border-border bg-track p-3 text-center text-sm text-text3">
                  ยังไม่มี Qmon ที่โตเต็มที่พร้อมท้าทาย
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {pets.map((pet) => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => setSelectedPetId(pet.id)}
                      aria-pressed={selectedPetId === pet.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                        selectedPetId === pet.id ? "border-gold bg-amber/10" : "border-border bg-card"
                      }`}
                    >
                      <Image src={pet.imagePath} alt={pet.speciesName} width={48} height={48} className="shrink-0" />
                      <span className="font-bold text-text">{pet.speciesName}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="w-full max-w-xs rounded-2xl border border-gold-dim bg-track p-3">
          <p className="mb-1 text-xs font-bold text-text2">กติกาบอส</p>
          <p className="text-sm text-text">
            ต้องตอบคำถามให้ถูกอย่างน้อย {raidType.bossPassCount} ใน {raidType.bossQuestionCount} ข้อ
            และสถิติรวมของ Qmon ต้องถึงเกณฑ์ด่านนี้ — พลาดข้อไหนก็ไปต่อได้เสมอ ไม่มีทางตัน
          </p>
        </section>

        <section className="w-full max-w-xs rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-sm font-bold text-text">ผ่านหรือไม่ผ่าน ก็ได้อุปกรณ์ติดมือกลับมาเสมอ</p>
        </section>

        {errorMessage && <p className="w-full max-w-xs text-center text-sm text-red">{errorMessage}</p>}

        <button
          type="button"
          disabled={!selectedPetId || isSending || ticketCount === 0}
          onClick={handleDepart}
          className="w-full max-w-xs rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {isSending ? "กำลังเริ่ม..." : ticketCount === 0 ? "ไม่มีตั๋วท้าทาย" : "ใช้ตั๋วเริ่มท้าทาย"}
        </button>
      </div>
    </main>
  );
}
