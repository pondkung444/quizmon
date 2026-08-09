"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DungeonInfo, EligiblePet } from "@/lib/dungeon";
import { DUNGEON_PITY_GOAL } from "@/lib/dungeon";
import { startDungeonRun } from "@/app/dungeon/actions";
import { RAID_TICKET_NAME_TH } from "@/lib/raid/labels";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import DungeonScene from "@/components/dungeon/DungeonScene";

// รางวัลไข่ของดันเจี้ยนนี้เป็น tier "rare" เสมอใน v1 — ไข่ฤทธิ์ธาร (egg4) เป็นไข่ tier rare ใบเดียว
// ที่มีอยู่ตอนนี้ ใช้สไปรต์ stage1 เดียวกับที่ WeeklyRewardCelebration/EggChoiceModal ใช้โชว์ไข่
const RARE_EGG_NAME_TH = "ไข่ฤทธิ์ธาร";
const RARE_EGG_IMAGE_PATH = "/pets/egg4_stage1_egg.png";

// จอ A — ก่อนส่ง Qmon ไปผจญภัย (v1 มีดันเจี้ยนเดียว แสดงเป็นการ์ดที่ถูกเลือกอยู่แล้ว ไม่ใช่ dropdown
// ว่างเปล่า — ออกแบบเผื่อ UI ไม่ต้องเปลี่ยนตอนเพิ่มดันเจี้ยนที่ 2 ในอนาคต)
export default function PreDeparture({
  dungeon,
  pets,
  pityMeter,
  preselectedPetId,
}: {
  dungeon: DungeonInfo;
  pets: EligiblePet[];
  pityMeter: number;
  preselectedPetId?: string | null;
}) {
  const router = useRouter();
  const [selectedPetId, setSelectedPetId] = useState<string | null>(
    preselectedPetId ?? pets[0]?.id ?? null
  );
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const durationHours = dungeon.durationMinutes / 60;
  // มาจาก /collection/[petId] ด้วย ?pet= ที่ผ่านการเช็คสิทธิ์แล้วฝั่ง server (page.tsx) — ล็อกตัวไว้
  // ไม่ต้องเลือกซ้ำ แต่ต้องมีทาง "เลือกตัวอื่น" กลับไปจอปกติเสมอ (แค่ทิ้ง ?pet= ไม่ใช่ path พิเศษ)
  const lockedPet = preselectedPetId ? pets.find((p) => p.id === preselectedPetId) ?? null : null;

  async function handleDepart() {
    if (!selectedPetId || isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    try {
      await startDungeonRun(selectedPetId, dungeon.id);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ออกเดินทางไม่สำเร็จ");
      setIsSending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title="ผจญภัย" />

      <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-5">
        <DungeonScene
          backgroundPath={dungeon.backgroundPath}
          overlay={{ nameTh: dungeon.nameTh, durationLabel: `${durationHours} ชั่วโมง` }}
        />

        {/* เลือกตัว — ล็อกแล้วถ้ามาจาก ?pet= ที่ผ่านสิทธิ์แล้ว */}
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
                <span className="font-sarabun font-bold text-text">{lockedPet.nickname ?? lockedPet.speciesName}</span>
              </div>
              <Link href="/adventure" className="mt-2 inline-block text-xs text-text3 underline">
                เลือกตัวอื่น
              </Link>
            </>
          ) : (
            <>
              <p className="mb-2 text-xs text-text2">เลือกตัว</p>
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
                    <span className="font-sarabun font-bold text-text">{pet.nickname ?? pet.speciesName}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* กลับมาพร้อมอะไร — เพิ่มใหม่ (Phase 4.5): จอ A เดิมมีแต่มิเตอร์ลอยๆ ไม่บอกว่าได้ไข่อะไร
            หน้าตายังไง ทำไมต้องอยากได้ */}
        <section className="w-full max-w-xs">
          <p className="mb-2 text-xs text-text2">กลับมาพร้อมอะไร</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <span className="text-2xl">🗝️</span>
              <div>
                <p className="text-sm font-bold text-text">{RAID_TICKET_NAME_TH} 1 ดอก</p>
                <p className="text-xs text-text3">ได้ทุกครั้งแน่นอน</p>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-gold bg-card p-3">
              <div className="flex items-center gap-3">
                <Image src={RARE_EGG_IMAGE_PATH} alt={RARE_EGG_NAME_TH} width={56} height={56} />
                <div>
                  <p className="font-bold text-gold-hi">{RARE_EGG_NAME_TH}</p>
                  <p className="text-xs text-text3">โอกาส 5% ทุกรอบ</p>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs text-text2">ครบ {DUNGEON_PITY_GOAL} รอบได้แน่นอน</p>
                <div className="mt-1 flex items-center justify-between">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-track">
                    <div
                      className="h-full bg-indigo transition-all"
                      style={{ width: `${Math.min(100, (pityMeter / DUNGEON_PITY_GOAL) * 100)}%` }}
                    />
                  </div>
                  <span className="ml-3 font-mono text-sm font-bold text-text">
                    {pityMeter} / {DUNGEON_PITY_GOAL}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* คำเตือน */}
        <p className="w-full max-w-xs text-center text-xs text-text3">
          ออกเดินทางแล้วรอครบ {durationHours} ชั่วโมง กลับก่อนไม่ได้นะ
        </p>

        {errorMessage && <p className="w-full max-w-xs text-center text-sm text-red">{errorMessage}</p>}

        {/* ปุ่มออกเดินทาง */}
        <button
          type="button"
          disabled={!selectedPetId || isSending}
          onClick={handleDepart}
          className="w-full max-w-xs rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {isSending ? "กำลังออกเดินทาง..." : "ออกเดินทาง"}
        </button>
      </div>
    </main>
  );
}
