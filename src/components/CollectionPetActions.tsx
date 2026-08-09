import Link from "next/link";
import type { DungeonEntryState } from "@/lib/dungeon";
import type { RaidEntryState } from "@/lib/raid";

const PRIMARY_LINK_CLASS =
  "flex w-full flex-col items-center gap-0.5 rounded-2xl border-2 border-gold py-3 text-center transition active:scale-95";
const DISABLED_CLASS =
  "flex w-full flex-col items-center gap-0.5 rounded-2xl border border-border bg-track py-3 text-center";

// server component ล้วน (ไม่มี "use client") — ปุ่มทั้งสองเป็น Link อย่างเดียว ไม่มี state/เขียน DB
// เลย วางเป็น sibling นอก CollectedPetCard.tsx (ไม่ใช่ prop ของมัน) เพื่อรักษาสัญญา write-free ของ
// การ์ดนั้นไว้ตามเดิม — ปุ่มท้าทายไม่แสดงเลยถ้าไม่อยู่ใน raid_allowlist (ซ่อนทั้งปุ่ม ไม่ใช่ disabled)
export default function CollectionPetActions({
  petId,
  dungeonState,
  raidState,
}: {
  petId: string;
  dungeonState: DungeonEntryState;
  raidState: RaidEntryState;
}) {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Link
        href={`/collection/${petId}/name`}
        className="flex w-full items-center justify-center rounded-2xl border border-border bg-track py-2 text-sm font-medium text-text2 transition active:scale-95"
      >
        แก้ไขชื่อ
      </Link>

      {dungeonState.status === "ready" && (
        <Link href={`/adventure?pet=${petId}`} className={PRIMARY_LINK_CLASS}>
          <span className="text-lg font-bold text-gold-hi">ส่งไปผจญภัย</span>
        </Link>
      )}
      {dungeonState.status === "own_traveling" && (
        <Link href="/adventure" className={PRIMARY_LINK_CLASS}>
          <span className="text-lg font-bold text-gold-hi">กำลังผจญภัยอยู่</span>
        </Link>
      )}
      {dungeonState.status === "own_claimable" && (
        <Link href="/adventure" className={PRIMARY_LINK_CLASS}>
          <span className="text-lg font-bold text-gold-hi">รับของจากผจญภัย</span>
        </Link>
      )}
      {dungeonState.status === "blocked_other_pet" && (
        <div className={DISABLED_CLASS}>
          <span className="text-sm text-text3">ตอนนี้ {dungeonState.otherPetName} กำลังผจญภัยอยู่</span>
        </div>
      )}

      {raidState.status === "ready" && (
        <Link href={`/raid?pet=${petId}`} className={PRIMARY_LINK_CLASS}>
          <span className="text-lg font-bold text-gold-hi">ส่งไปท้าทาย</span>
        </Link>
      )}
      {raidState.status === "own_run" && (
        <Link href="/raid" className={PRIMARY_LINK_CLASS}>
          <span className="text-lg font-bold text-gold-hi">เล่นค้างอยู่ · กลับไปต่อ</span>
        </Link>
      )}
      {raidState.status === "blocked_other_pet" && (
        <div className={DISABLED_CLASS}>
          <span className="text-sm text-text3">ตอนนี้ {raidState.otherPetName} ท้าทายค้างอยู่</span>
        </div>
      )}
      {raidState.status === "no_ticket" && (
        <div className={DISABLED_CLASS}>
          <span className="text-sm text-text3">กุญแจได้จากการรับของผจญภัย</span>
        </div>
      )}
      {/* raidState.status === "not_allowlisted" -> ไม่ render อะไรเลย ซ่อนทั้งปุ่ม */}
    </div>
  );
}
