"use client";

import { useState } from "react";
import Image from "next/image";

const TIER_LABEL: Record<string, string> = {
  common: "ธรรมดา",
  rare: "หายาก",
  epic: "เอปิก",
  legendary: "ในตำนาน",
};

export type EggChoice = {
  id: string;
  nameTh: string;
  tier: string;
  description: string | null;
  imagePath: string;
};

export default function EggChoiceModal({
  eggChoices,
  isPending,
  errorMessage,
  onConfirm,
}: {
  eggChoices: EggChoice[];
  isPending: boolean;
  errorMessage: string | null;
  onConfirm: (eggTypeId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(eggChoices[0]?.id ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-gold-dim bg-card p-6">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gold-hi">เก็บสำเร็จ! เลือกไข่ใบต่อไป</h2>
          <p className="text-sm text-text3">เลือกไข่ที่อยากฟักตัวถัดไป (เลือกชนิดเดิมซ้ำได้)</p>
        </div>

        <div className="flex flex-col gap-3">
          {eggChoices.map((egg) => (
            <button
              key={egg.id}
              type="button"
              onClick={() => setSelectedId(egg.id)}
              aria-pressed={selectedId === egg.id}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                selectedId === egg.id ? "border-gold bg-amber/10" : "border-gold-dim"
              }`}
            >
              <Image
                src={egg.imagePath}
                alt={egg.nameTh}
                width={48}
                height={48}
                className="shrink-0 rounded-lg"
              />
              <div>
                <p className="font-bold text-gold-hi">{egg.nameTh}</p>
                <p className="text-xs text-text3">{TIER_LABEL[egg.tier] ?? egg.tier}</p>
                {egg.description && <p className="mt-1 text-xs text-text2">{egg.description}</p>}
              </div>
            </button>
          ))}
        </div>

        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}

        <button
          type="button"
          disabled={!selectedId || isPending}
          onClick={() => selectedId && onConfirm(selectedId)}
          className="w-full rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {isPending ? "กำลังยืนยัน..." : "ยืนยันไข่ใบนี้"}
        </button>
      </div>
    </div>
  );
}
