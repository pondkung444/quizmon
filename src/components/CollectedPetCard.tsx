import Image from "next/image";
import StatRadar from "@/components/StatRadar";

function SublineChip({ label }: { label: string | null }) {
  return (
    <span className="rounded-full border border-gold-dim bg-track px-3 py-1 text-xs font-medium text-gold-hi">
      {label ?? "ยังไม่รู้"}
    </span>
  );
}

// การ์ดแบบ read-only สำหรับ Qmon ที่เก็บเข้าสมุดแล้ว (/collection/[petId]) — ไม่มี EXP bar/CTA/
// ปุ่มเก็บเข้าสมุดใดๆ ตั้งใจไม่ import CollectPetButton/EggChoiceModal เข้ามาเลย เพื่อการันตี
// ว่าหน้านี้เขียน DB ไม่ได้โดยโครงสร้าง ไม่ต้องพึ่ง flag เช็คหลายจุดแบบ PetCard
export default function CollectedPetCard({
  nickname,
  speciesName,
  petImagePath,
  sublineLabel,
  eggNameTh,
  stats,
}: {
  nickname: string | null;
  speciesName: string;
  petImagePath: string;
  sublineLabel: string | null;
  eggNameTh: string | null;
  stats: { hp: number; atk: number; def: number; spd: number; foc: number };
}) {
  return (
    <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className="h-2.5 w-2.5 rounded-full bg-amber" />
        ))}
      </div>

      <div className="relative flex h-14 w-14 items-center justify-center rotate-45 border-2 border-gold bg-track">
        <span className="-rotate-45 px-1 text-[10px] font-bold leading-tight text-gold-hi">
          {nickname ?? speciesName}
        </span>
      </div>

      <div className="relative flex h-[220px] w-[220px] items-center justify-center">
        <span className="absolute h-[200px] w-[200px] rounded-full bg-amber opacity-20 blur-2xl" />
        <Image
          src={petImagePath}
          alt={speciesName}
          width={180}
          height={180}
          priority
          className="relative animate-pet-bob"
        />
      </div>

      <h1 className="text-lg font-bold text-gold-hi">{speciesName}</h1>

      <div className="flex w-full flex-col items-center gap-4 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <SublineChip label={sublineLabel} />
          <SublineChip label={eggNameTh} />
        </div>

        <div>
          <h2 className="text-sm font-bold text-gold-hi">พลังประจำตัว</h2>
          <p className="text-xs text-text3">จะได้ใช้เมื่อระบบผจญภัย &amp; ต่อสู้เปิดในอนาคต</p>
        </div>

        <StatRadar stats={stats} />
      </div>
    </div>
  );
}
