import Link from "next/link";
import type { RaidZoneWithLevels } from "@/lib/raid";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import { RAID_MOUNTAIN_NAME_TH } from "@/lib/raid/labels";

// จอเลือกโซน — ใช้จริงเมื่อมี ≥2 โซน active (ตอนนี้มีแค่เขตน้ำแข็งเขตเดียว เส้นทางนี้ยังไม่มีใครเห็น)
// ทำแบบเรียบง่ายพอ ยังไม่ต้องขัดเกลาเท่าจอเลือกด่าน
export default function RaidZoneSelect({ zones }: { zones: RaidZoneWithLevels[] }) {
  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title={RAID_MOUNTAIN_NAME_TH} subtitle="เลือกเขตที่จะไปท้าทาย" />

      <div className="flex flex-col gap-3">
        {zones.map((zone) => (
          <Link
            key={zone.zoneId}
            href={`/raid?zone=${zone.zoneSlug}`}
            className="flex w-full items-center justify-between rounded-2xl border border-gold-dim bg-card p-4 transition active:scale-95"
          >
            <span className="text-lg font-bold text-gold-hi">{zone.zoneName}</span>
            <span className="text-xs text-text3">{zone.levels.length} ด่าน</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
