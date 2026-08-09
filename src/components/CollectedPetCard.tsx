import Image from "next/image";
import StatRadar from "@/components/StatRadar";

function SublineChip({ label }: { label: string | null }) {
  return (
    <span className="rounded-full border border-gold-dim bg-track px-3 py-1 text-xs font-medium text-gold-hi">
      {label ?? "ยังไม่รู้"}
    </span>
  );
}

// การ์ดแบบ read-only สำหรับ Qmon ที่เก็บเข้าฟาร์มแล้ว (/collection/[petId]) — ไม่มี EXP bar/CTA/
// ปุ่มเก็บเข้าฟาร์มใดๆ ตั้งใจไม่ import CollectPetButton/EggChoiceModal เข้ามาเลย เพื่อการันตี
// ว่าหน้านี้เขียน DB ไม่ได้โดยโครงสร้าง ไม่ต้องพึ่ง flag เช็คหลายจุดแบบ PetCard
export default function CollectedPetCard({
  nickname,
  speciesName,
  petImagePath,
  sublineLabel,
  eggNameTh,
  stats,
  evolvedAtLabel,
  questionsAnswered,
  accuracyPct,
  subjectStats,
}: {
  nickname: string | null;
  speciesName: string;
  petImagePath: string;
  sublineLabel: string | null;
  eggNameTh: string | null;
  stats: { hp: number; atk: number; def: number; spd: number; foc: number };
  evolvedAtLabel: string | null;
  questionsAnswered: number | null;
  accuracyPct: number | null;
  subjectStats: { label: string; answered: number; accuracyPct: number }[];
}) {
  return (
    <div className="flex w-full flex-col items-center gap-5 rounded-2xl border border-gold-dim bg-card p-6 text-center">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className="h-2.5 w-2.5 rounded-full bg-amber" />
        ))}
      </div>

      {/* nameplate — pill/แคปซูล ตามที่เปลี่ยนใน PetCard.tsx (ux pass 2026-07 รอบ 3) เพื่อความสม่ำเสมอ
          ทั้งแอป แม้หน้านี้จะไม่มีปัญหา fold โดยตรงก็ตาม (ปอนด์เลือกทางเลือกนี้เอง) */}
      <div className="flex h-9 items-center justify-center rounded-full border-2 border-gold bg-track px-4">
        <span className="whitespace-nowrap text-xs font-bold text-gold-hi">{nickname ?? speciesName}</span>
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
          <p className="text-xs text-text3">ใช้ตัดสินผลตอนไปท้าทายด่านต่างๆ</p>
        </div>

        <StatRadar stats={stats} />

        {(evolvedAtLabel || questionsAnswered !== null) && (
          <div className="flex w-full flex-wrap items-center justify-center gap-2 border-t border-border pt-4">
            {evolvedAtLabel && (
              <span className="rounded-full border border-border bg-track px-3 py-1 text-xs text-text2">
                โตเต็มที่เมื่อ {evolvedAtLabel}
              </span>
            )}
            {questionsAnswered !== null && (
              <span className="rounded-full border border-border bg-track px-3 py-1 text-xs text-text2">
                ตอบไปแล้ว {questionsAnswered} ข้อ
                {accuracyPct !== null && ` · แม่นยำ ${accuracyPct}%`}
              </span>
            )}
          </div>
        )}

        {subjectStats.length > 0 && (
          <div className="w-full">
            <h2 className="mb-2 text-sm font-bold text-gold-hi">แยกตามวิชา</h2>
            <div className="flex flex-col gap-2">
              {subjectStats.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between rounded-xl border border-border bg-track px-3 py-2"
                >
                  <span className="text-sm font-medium text-text">{s.label}</span>
                  <span className="text-xs text-text2">
                    {s.answered} ข้อ · แม่นยำ {s.accuracyPct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
