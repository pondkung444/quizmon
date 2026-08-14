"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import BottomSheet from "@/components/social/BottomSheet";
import { resolvePetDisplay, type PetSummary } from "@/components/social/petSummary";
import { setFavoriteQmon } from "@/app/social/actions";

const MAX_FAVORITES = 3;

// B04 — เลือกได้สูงสุด 3 ตัว จาก stage 4 ทั้งหมด "ที่ไม่ใช่ pride_pet_id ปัจจุบัน" (§11.3) กดยืนยัน
// ครั้งเดียวตอนจบ ต่างจาก B02 ที่บันทึกทันทีทีละครั้ง
export default function SelectFavoriteQmonSheet({
  stage4Pets,
  currentPrideId,
  currentFavoriteIds,
  onSaved,
  onClose,
}: {
  stage4Pets: PetSummary[];
  currentPrideId: string | null;
  currentFavoriteIds: string[];
  onSaved: (favoritePetIds: string[]) => void;
  onClose: () => void;
}) {
  const candidates = stage4Pets.filter((pet) => pet.id !== currentPrideId);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    currentFavoriteIds.filter((id) => candidates.some((pet) => pet.id === id))
  );
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggle(petId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(petId)) return prev.filter((id) => id !== petId);
      if (prev.length >= MAX_FAVORITES) return prev;
      return [...prev, petId];
    });
  }

  function handleSave() {
    if (isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await setFavoriteQmon(selectedIds);
        onSaved(result.favoritePetIds);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "บันทึก Qmon ตัวโปรดไม่สำเร็จ");
      }
    });
  }

  return (
    <BottomSheet title={`เลือก Qmon ตัวโปรด (${selectedIds.length}/${MAX_FAVORITES})`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {candidates.length === 0 && (
          <p className="p-4 text-center text-sm text-text3">ยังไม่มี Qmon ระยะร่างสมบูรณ์ตัวอื่นให้เลือก</p>
        )}
        {candidates.map((pet) => {
          const { imagePath, speciesName } = resolvePetDisplay(pet);
          const isSelected = selectedIds.includes(pet.id);
          const isLocked = !isSelected && selectedIds.length >= MAX_FAVORITES;
          return (
            <button
              key={pet.id}
              type="button"
              disabled={isLocked}
              onClick={() => toggle(pet.id)}
              aria-pressed={isSelected}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl border p-2 text-left transition disabled:opacity-40 ${
                isSelected ? "border-gold bg-amber/10" : "border-gold-dim"
              }`}
            >
              {imagePath && (
                <Image src={imagePath} alt={speciesName} width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-text">{pet.nickname ?? speciesName}</p>
                <p className="truncate text-xs text-text3">{speciesName}</p>
              </div>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  isSelected ? "border-gold bg-amber text-track" : "border-gold-dim text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>

      {errorMessage && <p className="mt-3 text-center text-sm text-red">{errorMessage}</p>}

      <button
        type="button"
        disabled={isPending}
        onClick={handleSave}
        className="mt-4 w-full rounded-2xl border border-gold bg-amber py-3 text-base font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {isPending ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </BottomSheet>
  );
}
