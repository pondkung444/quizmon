"use client";

import { useMemo, useState } from "react";
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

// 2 การ์ดปักหมุด: พลังรวมสูงสุด ("แรงสุด") + ใช้บ่อยสุดในแมตช์ PvP all-time ("ใช้บ่อย")
// ถ้าตัวเดียวกันเข้าเงื่อนไขทั้งคู่ ให้โชว์ครั้งเดียวเป็นมงกุฎ แล้วเลื่อนตัวรองขึ้นมาแทนช่องที่สอง
function pickRecommended(pets: PvpPetPick[]): { crown: PvpPetPick | null; hot: PvpPetPick | null } {
  if (pets.length === 0) return { crown: null, hot: null };
  const byStat = [...pets].sort((a, b) => b.statTotal - a.statTotal);
  const byUsage = [...pets].sort((a, b) => b.matchCount - a.matchCount);
  const crown = byStat[0];

  let hot: PvpPetPick | null = byUsage.find((p) => p.id !== crown.id && p.matchCount > 0) ?? null;
  if (!hot) {
    // ไม่มีประวัติแมตช์เลย (บัญชีใหม่) — เติมช่องที่สองด้วยตัวพลังรวมรองลงมาแทน ไม่โชว์ badge ใช้บ่อย
    hot = byStat.find((p) => p.id !== crown.id) ?? null;
  }
  return { crown, hot };
}

function RecoCard({
  pet,
  tag,
  active,
  onSelect,
}: {
  pet: PvpPetPick;
  tag: { label: string; kind: "crown" | "hot" } | null;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex-1 rounded-2xl border p-3 pt-4 text-center transition ${
        active ? "border-gold bg-amber/10" : "border-border bg-card"
      }`}
    >
      {tag && (
        <span
          className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold ${
            tag.kind === "crown" ? "bg-gold/20 text-gold-hi" : "bg-red/20 text-red"
          }`}
        >
          {tag.label}
        </span>
      )}
      <div className="relative mx-auto h-16 w-16">
        <Image src={pet.imagePath} alt="" fill className="object-contain" unoptimized />
      </div>
      <p className="mt-1 truncate text-sm font-bold text-text">{pet.nickname ?? pet.speciesName}</p>
      <p className="text-[11px] text-text3">{SUBLINE_TH[pet.subline] ?? pet.subline}</p>
      <p className="mt-1 text-[11px] font-bold text-gold-dim">พลังรวม {pet.statTotal}</p>
    </button>
  );
}

function CompactRow({ pet, active, onSelect }: { pet: PvpPetPick; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
        active ? "border-gold bg-amber/10" : "border-border bg-card"
      }`}
    >
      <div className="relative h-9 w-9 shrink-0">
        <Image src={pet.imagePath} alt="" fill className="object-contain" unoptimized />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-text">{pet.nickname ?? pet.speciesName}</p>
        <p className="text-[10px] text-text3">{SUBLINE_TH[pet.subline] ?? pet.subline}</p>
      </div>
      <span className="shrink-0 text-xs font-bold text-gold-dim">{pet.statTotal}</span>
    </button>
  );
}

export default function PvpPetPicker({
  pets,
  selectedId,
  onSelect,
}: {
  pets: PvpPetPick[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [restOpen, setRestOpen] = useState(false);
  const selected = pets.find((p) => p.id === selectedId) ?? null;
  const { crown, hot } = useMemo(() => pickRecommended(pets), [pets]);
  const rest = pets.filter((p) => p.id !== crown?.id && p.id !== hot?.id);

  return (
    <div>
      {crown && (
        <>
          <p className="mb-2 text-xs font-bold text-gold-dim">แนะนำสำหรับคุณ</p>
          <div className="flex gap-2">
            <RecoCard
              pet={crown}
              tag={{ label: "👑 แรงสุด", kind: "crown" }}
              active={crown.id === selectedId}
              onSelect={() => onSelect(crown.id)}
            />
            {hot && (
              <RecoCard
                pet={hot}
                tag={hot.matchCount > 0 ? { label: "🔥 ใช้บ่อย", kind: "hot" } : null}
                active={hot.id === selectedId}
                onSelect={() => onSelect(hot.id)}
              />
            )}
          </div>
        </>
      )}

      {rest.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setRestOpen((v) => !v)}
            className="flex w-full items-center justify-between px-1 py-2 text-xs font-bold text-text2"
          >
            <span>ดู Qmon ตัวอื่น ({rest.length} ตัว)</span>
            <span className={`transition-transform ${restOpen ? "rotate-180" : ""}`}>⌄</span>
          </button>
          {restOpen && (
            <div className="mt-1 flex flex-col gap-1.5">
              {rest.map((p) => (
                <CompactRow key={p.id} pet={p} active={p.id === selectedId} onSelect={() => onSelect(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}

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
