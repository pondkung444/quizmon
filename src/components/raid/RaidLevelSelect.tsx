import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import type { RaidZoneWithLevels } from "@/lib/raid";
import AdventureHeader from "@/components/dungeon/AdventureHeader";
import { RAID_MOUNTAIN_NAME_TH } from "@/lib/raid/labels";

// จอเลือกด่านของโซนเดียว — การ์ดแนวตั้ง 1 ใบต่อด่าน ใช้ backgroundPath ของด่านเป็นภาพพื้นการ์ดตรงๆ
// (มีภาพจริงครบทุกด่านอยู่แล้ว ไม่ต้องวาดภาพแผนที่แยก) server component ล้วน ไม่มี state
export default function RaidLevelSelect({
  zone,
  petParam,
}: {
  zone: RaidZoneWithLevels;
  petParam?: string | null;
}) {
  return (
    <main className="mx-auto flex w-full min-h-screen max-w-xl flex-col gap-4 p-6 pb-24">
      <AdventureHeader title={`${RAID_MOUNTAIN_NAME_TH} · ${zone.zoneName}`} subtitle="เลือกด่านที่จะไปท้าทาย" />

      <div className="flex flex-col gap-3">
        {zone.levels.map((level) => {
          const href = `/raid/${level.slug}${petParam ? `?pet=${petParam}` : ""}`;

          const card = (
            <div className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl border border-gold-dim">
              {level.backgroundPath && (
                <Image
                  src={level.backgroundPath}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 42rem"
                  className={`object-cover object-center ${!level.unlocked ? "opacity-50 grayscale" : ""}`}
                />
              )}
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-4">
                <span className="text-lg font-bold text-gold-hi">{level.nameTh}</span>
                {level.bossNameTh && <span className="text-xs text-white/80">บอส: {level.bossNameTh}</span>}
              </div>

              {level.cleared && level.unlocked && (
                <div className="absolute right-3 top-3 rounded-full bg-amber px-2 py-1 text-xs font-bold text-track">
                  ผ่านแล้ว
                </div>
              )}

              {!level.unlocked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Lock size={32} className="text-white/90" />
                </div>
              )}
            </div>
          );

          return level.unlocked ? (
            <Link key={level.id} href={href} className="transition active:scale-95">
              {card}
            </Link>
          ) : (
            <div key={level.id}>{card}</div>
          );
        })}
      </div>
    </main>
  );
}
