"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import BottomSheet from "@/components/social/BottomSheet";
import { resolvePetDisplay, type PetSummary } from "@/components/social/petSummary";
import { setPrideQmon } from "@/app/social/actions";

// B02 — เลือกแล้วบันทึกทันที (ตาม §11.3) ไม่มีปุ่มยืนยันแยก ต่างจาก B03/B04 ที่เลือกได้หลายอัน
export default function SelectPrideQmonSheet({
  candidates,
  currentPrideId,
  onSaved,
  onClose,
}: {
  candidates: PetSummary[];
  currentPrideId: string | null;
  onSaved: (result: { pridePetId: string; favoritePetIds: string[] }) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handlePick(petId: string) {
    if (isPending || petId === currentPrideId) return;
    setErrorMessage(null);
    setPendingId(petId);
    startTransition(async () => {
      try {
        const result = await setPrideQmon(petId);
        onSaved(result);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "เลือก Qmon ที่ภูมิใจไม่สำเร็จ");
        setPendingId(null);
      }
    });
  }

  return (
    <BottomSheet title="เลือก Qmon ที่ภูมิใจ" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {candidates.map((pet) => {
          const { imagePath, speciesName } = resolvePetDisplay(pet);
          const isCurrent = pet.id === currentPrideId;
          const isBusy = isPending && pendingId === pet.id;
          return (
            <button
              key={pet.id}
              type="button"
              disabled={isPending}
              onClick={() => handlePick(pet.id)}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl border p-2 text-left transition disabled:opacity-60 ${
                isCurrent ? "border-gold bg-amber/10" : "border-gold-dim"
              }`}
            >
              {imagePath && (
                <Image src={imagePath} alt={speciesName} width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-text">{pet.nickname ?? speciesName}</p>
                <p className="truncate text-xs text-text3">{speciesName}</p>
              </div>
              {isCurrent && <span className="shrink-0 text-xs font-bold text-gold-hi">กำลังใช้</span>}
              {isBusy && <span className="shrink-0 text-xs text-text3">กำลังบันทึก...</span>}
            </button>
          );
        })}
      </div>
      {errorMessage && <p className="mt-3 text-center text-sm text-red">{errorMessage}</p>}
    </BottomSheet>
  );
}
