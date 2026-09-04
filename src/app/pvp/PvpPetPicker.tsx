"use client";

import Image from "next/image";
import type { PvpPetPick } from "@/lib/pvp";
import PvpStatRadar from "./PvpStatRadar";

const SUBLINE_TH: Record<string, string> = {
  math: "สายเลข",
  science: "สายวิทย์",
  balanced: "สายสมดุล",
  physics: "สายฟิสิกส์",
  chemistry: "สายเคมี",
  biology: "สายชีวะ",
};

export default function PvpPetPicker({
  pets,
  selectedId,
  onSelect,
}: {
  pets: PvpPetPick[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = pets.find((p) => p.id === selectedId) ?? null;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {pets.map((p) => {
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`rounded-xl border p-2 text-center transition ${
                active ? "border-gold bg-amber/10" : "border-border bg-card"
              }`}
            >
              <div className="relative mx-auto h-16 w-16">
                <Image src={p.imagePath} alt="" fill className="object-contain" unoptimized />
              </div>
              <p className="mt-1 truncate text-xs font-bold text-text">
                {p.nickname ?? p.speciesName}
              </p>
              <p className="text-[10px] text-text3">{SUBLINE_TH[p.subline] ?? p.subline}</p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-3 rounded-xl border border-gold-dim bg-card p-3">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0">
              <Image src={selected.imagePath} alt="" fill className="object-contain" unoptimized />
            </div>
            <div>
              <p className="text-sm font-bold text-text">
                {selected.nickname ?? selected.speciesName}
              </p>
              <p className="text-xs text-text3">
                {SUBLINE_TH[selected.subline] ?? selected.subline}
              </p>
            </div>
          </div>
          <PvpStatRadar stats={selected.stats} />
          <div className="grid grid-cols-5 gap-1 text-center text-[10px] text-text3">
            <span>HP {selected.stats.hp}</span>
            <span>ตี {selected.stats.atk}</span>
            <span>กัน {selected.stats.def}</span>
            <span>เร็ว {selected.stats.spd}</span>
            <span>คริ {selected.stats.foc}</span>
          </div>
        </div>
      )}
    </div>
  );
}
