"use client";

import Link from "next/link";
import type { DungeonCardState } from "@/lib/dungeon";
import { useDungeonProgress, formatCountdown } from "@/hooks/useDungeonProgress";

// แถบด่วนติดบนสุดเมื่อเลื่อนผ่าน (11 ส.ค. 2026 — เปิดระบบท้าทายให้เล่นจริง) วางระหว่างการ์ด
// weekly leaderboard กับ nameplate ใน PetCard.tsx — 2 ชิปเท่ากัน ไม่มีสถานะล็อกแล้ว (allowlist
// เปิดให้ทุกคนแล้ว) แตะแล้วพาไปหน้าเต็มของระบบนั้นตรงๆ ไม่ใช่แค่ scroll ไปหาการ์ดเดิมที่อยู่ล่างๆ
export default function StickyActionBanner({
  dungeonCard,
  raidTicketCount,
}: {
  dungeonCard: DungeonCardState;
  raidTicketCount: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex w-full gap-2 rounded-xl border border-gold-dim bg-card p-2 shadow-md">
      <AdventureChip state={dungeonCard} />
      <Link
        href="/raid"
        className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-track px-3 py-2 transition active:scale-95"
      >
        <span className="text-xl" aria-hidden>
          ⚔️
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[11px] font-bold text-text2">ท้าทาย</span>
          <span className="block truncate text-xs text-text3">มีกุญแจ {raidTicketCount} ดอก</span>
        </span>
      </Link>
    </div>
  );
}

function AdventureChip({ state }: { state: DungeonCardState }) {
  if (state.status === "traveling" || state.status === "claimable") {
    return <AdventureChipActive state={state} />;
  }

  const statusText = state.status === "ready" ? "พร้อมออกเดินทาง!" : "รอ Qmon โตเต็มที่";

  return (
    <Link
      href="/adventure"
      className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-track px-3 py-2 transition active:scale-95"
    >
      <span className="text-xl" aria-hidden>
        🗺️
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] font-bold text-text2">ผจญภัย</span>
        <span className="block truncate text-xs text-text3">{statusText}</span>
      </span>
    </Link>
  );
}

// แยกออกมาเพราะ useDungeonProgress ต้องมี run.startedAt/endsAt จริง เรียก hook แบบมีเงื่อนไขไม่ได้
// (rules of hooks) — เช่นเดียวกับ ActiveDungeonStrip ใน DungeonAdventureCard.tsx ตัวเลขนับถอยหลัง
// ใช้ hook เดียวกันเป๊ะให้ตรงกับการ์ดผจญภัยด้านล่าง ไม่ใช่คำนวณแยกแล้วเพี้ยนกันเป็นวินาที
function AdventureChipActive({
  state,
}: {
  state: Extract<DungeonCardState, { status: "traveling" | "claimable" }>;
}) {
  const { remainingMs } = useDungeonProgress(state.run.startedAt, state.run.endsAt);
  const isClaimable = state.status === "claimable";

  return (
    <Link
      href="/adventure"
      className={`relative flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 transition active:scale-95 ${
        isClaimable ? "border-gold bg-amber/10" : "border-border bg-track"
      }`}
    >
      {isClaimable && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red" aria-hidden />
      )}
      <span className="text-xl" aria-hidden>
        🗺️
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={`block text-[11px] font-bold ${isClaimable ? "text-gold-hi" : "text-text2"}`}>
          ผจญภัย
        </span>
        <span className={`block truncate text-xs ${isClaimable ? "text-gold-hi" : "text-text3"}`}>
          {isClaimable ? "เก็บรางวัลได้แล้ว!" : `กำลังเดินทาง ${formatCountdown(remainingMs)}`}
        </span>
      </span>
    </Link>
  );
}
