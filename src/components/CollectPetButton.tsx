"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { collectPet, chooseEggAfterCollect } from "@/app/pet/actions";
import EggChoiceModal, { type EggChoice } from "@/components/EggChoiceModal";

export default function CollectPetButton({ eggChoices }: { eggChoices: EggChoice[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showEggChoice, setShowEggChoice] = useState(false);

  function handleCollect() {
    if (isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await collectPet();
        setShowEggChoice(true);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "เก็บเข้าสมุดไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      }
    });
  }

  function handleChooseEgg(eggTypeId: string) {
    if (isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await chooseEggAfterCollect(eggTypeId);
        router.push("/eggs");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "เลือกไข่ไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      }
    });
  }

  if (showEggChoice) {
    return (
      <EggChoiceModal
        eggChoices={eggChoices}
        isPending={isPending}
        errorMessage={errorMessage}
        onConfirm={handleChooseEgg}
      />
    );
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={handleCollect}
        className="w-full rounded-2xl bg-red py-3 text-lg font-bold text-text shadow-lg transition active:scale-95 disabled:opacity-50"
      >
        {isPending ? "กำลังเก็บ..." : "เก็บเข้าสมุด"}
      </button>
      {errorMessage && <p className="text-sm text-red">{errorMessage}</p>}
    </div>
  );
}
