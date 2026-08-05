"use client";

import Image from "next/image";

// สเปกฉากรอบแก้ (2026-08-05): กลับไปใช้ aspect-[8/3] เต็มความกว้าง ตามสเปกดีไซน์ล่าสุด — cave_frost.webp
// เป็น 2048x768 ซึ่งคือ 8:3 พอดี ทำให้ object-cover ไม่ต้องครอปเลย เห็นฉากเต็มภาพเสมอไม่ว่ากว้างแค่ไหน
// (รอบก่อน 2026-08-04 เคยล็อกความสูงคงที่ 150px ไว้เพราะกลัวสไปรต์เล็ก แต่วิธีนั้นทำให้ฉากผิดสัดส่วนบน
// จอกว้าง — คงสไปรต์ไว้ที่ 32% ของความสูงฉากเหมือนเดิม ที่ความกว้างคอนเทนเนอร์ ~350-420px ตามสเปกจอ C
// จะได้ความสูงฉาก ~130-160px ใกล้เคียงของเดิม สไปรต์ยังเห็นชัดไม่เล็กจมแบบที่เจอตอน 2026-08-03)
const SPRITE_HEIGHT_PERCENT = 32; // อยู่ในช่วง 30-34% ตามสเปกใหม่
const SPRITE_FEET_TOP_PERCENT = 82;

export type DungeonSceneSprite = {
  imagePath: string;
  xPercent: number;
  animate: boolean; // true = เดินอยู่ (จอ B, เด้ง+ขยับ), false = นิ่งที่ปลายทาง (จอ C)
};

export type DungeonSceneOverlay = {
  nameTh: string;
  durationLabel: string;
};

// ฉากพื้นหลังดันเจี้ยน ใช้ร่วมกันทั้ง 3 จอ — full-bleed ชนขอบซ้าย-ขวาของการ์ด (ยกเลิก padding
// ของ card wrapper ที่ห่ออยู่ด้วย -mx-5/w-[calc(100%+2.5rem)] แทนที่จะเว้นขอบเหมือนเนื้อหาอื่น)
export default function DungeonScene({
  backgroundPath,
  sprite,
  overlay,
}: {
  backgroundPath: string;
  sprite?: DungeonSceneSprite | null;
  overlay?: DungeonSceneOverlay | null;
}) {
  return (
    <div className="relative -mx-5 aspect-[8/3] w-[calc(100%+2.5rem)] overflow-hidden">
      <Image
        src={backgroundPath}
        alt=""
        fill
        sizes="100vw"
        priority
        className="object-cover object-center"
      />

      {overlay && (
        <>
          <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1">
            <span className="text-sm font-bold text-gold-hi">{overlay.nameTh}</span>
          </div>
          <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-3 py-1">
            <span className="text-xs text-text">{overlay.durationLabel}</span>
          </div>
        </>
      )}

      {sprite && (
        <>
          {/* เงาวงรีใต้เท้ามอน — กันสไปรต์สีอ่อนจมกับพื้นหิมะที่สว่างกว่าผนัง */}
          <div
            className="absolute h-2 w-10 rounded-full transition-[left] duration-1000 ease-linear"
            style={{
              left: `${sprite.xPercent}%`,
              top: `${SPRITE_FEET_TOP_PERCENT}%`,
              transform: "translate(-50%, -4px)",
              background: "radial-gradient(closest-side, rgba(10,20,50,0.25), transparent)",
            }}
          />
          <div
            className={`absolute transition-[left] duration-1000 ease-linear ${
              sprite.animate ? "animate-dungeon-walk-bob" : ""
            }`}
            style={{
              left: `${sprite.xPercent}%`,
              top: `${SPRITE_FEET_TOP_PERCENT}%`,
              height: `${SPRITE_HEIGHT_PERCENT}%`,
              ...(sprite.animate ? {} : { transform: "translate(-50%, -100%)" }),
            }}
          >
            <Image
              src={sprite.imagePath}
              alt=""
              width={120}
              height={120}
              className="h-full w-auto object-contain drop-shadow-lg"
            />
          </div>
        </>
      )}
    </div>
  );
}
