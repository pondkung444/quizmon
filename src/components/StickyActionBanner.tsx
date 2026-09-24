"use client";

import Link from "next/link";
import type { DungeonCardState } from "@/lib/dungeon";
import { useDungeonProgress, formatCountdown } from "@/hooks/useDungeonProgress";
import { useSfx } from "@/lib/audio/useSfx";

// แถบด่วนติดบนสุดเมื่อเลื่อนผ่าน (11 ส.ค. 2026 — เปิดระบบท้าทายให้เล่นจริง) วางระหว่างการ์ด
// weekly leaderboard กับ nameplate ใน PetCard.tsx — 2 ชิปเท่ากัน ไม่มีสถานะล็อกแล้ว (allowlist
// เปิดให้ทุกคนแล้ว) แตะแล้วพาไปหน้าเต็มของระบบนั้นตรงๆ ไม่ใช่แค่ scroll ไปหาการ์ดเดิมที่อยู่ล่างๆ
// ธีมหน้า /pet (2026-09): เปลี่ยนเป็นไทล์สี 2 ใบ (--pet-tile-* ใน globals.css) ทุกไทล์ต้อง min-w-0 —
// ไม่งั้นข้อความในไทล์ไม่ยอมหด ดันทั้งหน้ากว้างเกินจอมือถือ
const TILE = "relative flex min-w-0 items-center gap-2 rounded-2xl px-3 py-2.5 shadow-md transition active:scale-95";
const ADVENTURE_TILE = `${TILE} bg-(--pet-tile-adv-bg) text-(--pet-tile-adv-text)`;
const RAID_TILE = `${TILE} bg-(--pet-tile-raid-bg) text-(--pet-tile-raid-text)`;
const TILE_ICON = "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/60 text-xl";
export default function StickyActionBanner({
  dungeonCard,
  raidTicketCount,
}: {
  dungeonCard: DungeonCardState;
  raidTicketCount: number;
}) {
  const sfx = useSfx();
  return (
    <div className="sticky top-0 z-10 grid w-full grid-cols-2 gap-2 rounded-2xl bg-bg/80 p-1 backdrop-blur">
      <AdventureChip state={dungeonCard} />
      <Link
        href="/raid"
        onClick={() => sfx("tap")}
        className={RAID_TILE}
      >
        <span className={TILE_ICON} aria-hidden>
          ⚔️
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-bold">ท้าทาย</span>
          <span className="block truncate text-[11px] opacity-90">มีกุญแจ {raidTicketCount} ดอก</span>
        </span>
      </Link>
    </div>
  );
}

function AdventureChip({ state }: { state: DungeonCardState }) {
  const sfx = useSfx();
  if (state.status === "traveling" || state.status === "claimable") {
    return <AdventureChipActive state={state} />;
  }

  const statusText = state.status === "ready" ? "พร้อมออกเดินทาง!" : "รอ Qmon โตเต็มที่";

  return (
    <Link
      href="/adventure"
      onClick={() => sfx("tap")}
      className={ADVENTURE_TILE}
    >
      <span className={TILE_ICON} aria-hidden>
        🗺️
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-bold">ผจญภัย</span>
        <span className="block truncate text-[11px] opacity-90">{statusText}</span>
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
      className={`${ADVENTURE_TILE} ${isClaimable ? "ring-2 ring-gold" : ""}`}
    >
      {isClaimable && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red" aria-hidden />
      )}
      <span className={TILE_ICON} aria-hidden>
        🗺️
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-bold">ผจญภัย</span>
        <span className={`block truncate text-[11px] ${isClaimable ? "font-bold" : "opacity-90"}`}>
          {isClaimable ? "เก็บรางวัลได้แล้ว!" : `กำลังเดินทาง ${formatCountdown(remainingMs)}`}
        </span>
      </span>
    </Link>
  );
}
