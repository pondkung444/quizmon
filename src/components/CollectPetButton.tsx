"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { collectPet } from "@/app/pet/actions";

export default function CollectPetButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleCollect() {
    if (isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await collectPet();
        router.push("/eggs");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "เก็บเข้าสมุดไม่สำเร็จ ลองใหม่อีกครั้งนะ");
      }
    });
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
