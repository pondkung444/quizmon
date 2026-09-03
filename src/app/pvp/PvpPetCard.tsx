"use client";

import Image from "next/image";
import type { PvpPetPick } from "@/lib/pvp";

const SUBLINE_TH: Record<string, string> = {
  math: "สายเลข",
  science: "สายวิทย์",
  balanced: "สายสมดุล",
  physics: "สายฟิสิกส์",
  chemistry: "สายเคมี",
  biology: "สายชีวะ",
};

export function PvpPetCard({
  pet,
  selected,
  onSelect,
}: {
  pet: PvpPetPick;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left transition ${
        selected ? "border-gold bg-amber/10" : "border-border bg-card"
      }`}
    >
      <div className="relative mx-auto h-20 w-20">
        <Image src={pet.imagePath} alt="" fill className="object-contain" unoptimized />
      </div>
      <p className="mt-2 truncate text-sm font-bold text-text">
        {pet.nickname ?? pet.speciesName}
      </p>
      <p className="text-xs text-text3">{SUBLINE_TH[pet.subline] ?? pet.subline}</p>
      <p className="mt-1 text-[11px] text-text3">
        HP {pet.stats.hp} · ตี {pet.stats.atk} · กัน {pet.stats.def}
      </p>
      <p className="text-[11px] text-text3">
        เร็ว {pet.stats.spd} · คริ {pet.stats.foc}
      </p>
    </button>
  );
}
