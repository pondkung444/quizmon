"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hatchEgg } from "@/app/eggs/actions";

const TIER_LABEL: Record<string, string> = {
  common: "ธรรมดา",
  rare: "หายาก",
  legendary: "ในตำนาน",
};

export type EggListItem = {
  id: string;
  source: string;
  obtainedAt: string;
  eggTypeId: string;
  nameTh: string;
  tier: string;
  description: string | null;
};

export default function EggsClient({
  eggs,
  hasActivePet,
}: {
  eggs: EggListItem[];
  hasActivePet: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hatchingId, setHatchingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleHatch(eggId: string) {
    if (isPending) return;
    setErrorMessage(null);
    setHatchingId(eggId);
    startTransition(async () => {
      try {
        await hatchEgg(eggId);
        router.push("/pet");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "ฟักไข่ไม่สำเร็จ ลองใหม่อีกครั้งนะ");
        setHatchingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {hasActivePet && (
        <p className="rounded-xl border border-amber-dim bg-amber/10 p-3 text-center text-sm text-amber">
          กำลังเลี้ยงอยู่ 1 ตัว เก็บเข้าสมุดก่อนถึงจะฟักตัวใหม่ได้ —{" "}
          <a href="/pet" className="font-bold underline">
            ไปหน้าเลี้ยงสัตว์
          </a>
        </p>
      )}

      {errorMessage && (
        <p className="rounded-xl border border-red bg-red/10 p-3 text-center text-sm text-red">
          {errorMessage}
        </p>
      )}

      {eggs.length === 0 ? (
        <p className="rounded-xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          ยังไม่มีไข่ในคลัง
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {eggs.map((egg) => (
            <div
              key={egg.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-gold-dim bg-card p-4"
            >
              <div>
                <p className="font-bold text-gold-hi">{egg.nameTh}</p>
                <p className="text-xs text-text3">{TIER_LABEL[egg.tier] ?? egg.tier}</p>
                {egg.description && (
                  <p className="mt-1 text-sm text-text2">{egg.description}</p>
                )}
              </div>
              <button
                type="button"
                disabled={hasActivePet || isPending}
                onClick={() => handleHatch(egg.id)}
                className="shrink-0 rounded-xl border border-gold bg-amber px-4 py-2 text-sm font-bold text-track shadow transition active:scale-95 disabled:opacity-50"
              >
                {isPending && hatchingId === egg.id ? "กำลังฟัก..." : "ฟักไข่นี้"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
