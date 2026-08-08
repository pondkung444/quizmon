"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { getSpriteGroundOffsetPercent } from "@/lib/raid/spriteGroundOffsets";

export type RaidSceneSprite = {
  imagePath: string;
  leftPercent: number;
  heightPercent: number;
  // ""  = นิ่ง (ต้อง inline transform เอง) — ไม่ว่าง = ชื่อ animation class ที่ bake
  // translate(-50%, -100%) ไว้ในตัว keyframes แล้ว (ดู .animate-dungeon-walk-bob/.animate-boss-idle/
  // .animate-boss-hit ใน globals.css) ห้ามใส่ inline transform ซ้ำเวลามี class เพราะจะชนกัน
  animationClass?: string;
  flip?: boolean;
  shadow?: boolean;
  alt?: string;
  // React key ของ wrapper div — ปกติ index เฉยๆ ก็พอ แต่จอบอสต้องบังคับ remount ทุกครั้งที่มีผลตอบ
  // ใหม่เพื่อให้ animation แบบ one-shot (.animate-boss-hit/.animate-qmon-flinch) เล่นซ้ำได้ (เดิม
  // RaidBossScreen ใช้ hitKey ทำแบบนี้อยู่แล้วก่อน RaidScene จะมี) ส่งค่าที่เปลี่ยนทุกครั้งมาที่นี่แทน
  spriteKey?: string | number;
};

// ฉากกลางของระบบท้าทายทุกจอ (predeparture/choosing/quiz/boss/reward) — จุดเดียวที่กำหนดขนาด/
// สัดส่วนกล่องฉาก กันแต่ละจอกำหนดเอง (เจอ feedback จริงว่าฉากกว้างไม่เท่ากันระหว่างจอตอนใช้
// DungeonScene.tsx ของฝั่งผจญภัยแบบกระจายๆ) ไม่ reuse DungeonScene.tsx ตรงๆ อีกต่อไป — คนละ
// ฟีเจอร์ คนละ constraint (บอสต้องใหญ่กว่าสไปรต์ Qmon เดิมที่ DungeonScene ล็อกไว้ 32%)
export default function RaidScene({
  backgroundPath,
  sprites = [],
  nameLabel,
}: {
  backgroundPath: string | null;
  sprites?: RaidSceneSprite[];
  // ป้ายชื่อมุมบนซ้ายของฉาก — ใช้บอกว่ากำลังสู้กับใคร (จอบอส) สไตล์ตามพิลชื่อ/เวลา ของ
  // DungeonScene.tsx (bg-black/50 px-3 py-1 rounded-full) ให้ดูเป็นระบบเดียวกัน ไม่มีก็ไม่โชว์
  nameLabel?: string | null;
}) {
  if (!backgroundPath) return null;

  return (
    <div className="relative -mx-5 aspect-[8/3] w-[calc(100%+2.5rem)] overflow-hidden">
      <Image src={backgroundPath} alt="" fill sizes="100vw" priority className="object-cover object-center" />

      {nameLabel && (
        <div className="absolute left-3 top-3 rounded-full bg-black/50 px-3 py-1">
          <span className="text-sm font-bold text-gold-hi">{nameLabel}</span>
        </div>
      )}

      {sprites.map((sprite, index) => (
        <div key={sprite.spriteKey ?? index}>
          {sprite.shadow !== false && (
            <div
              className="absolute h-2.5 w-12 rounded-full"
              style={{
                left: `${sprite.leftPercent}%`,
                top: "82%",
                transform: "translate(-50%, -4px)",
                background: "radial-gradient(closest-side, rgba(10,20,50,0.4), transparent)",
              }}
            />
          )}
          {/* transform inline เสมอ ไม่ว่าจะมี animationClass หรือไม่ — คีย์เฟรมของ animation
              แบบเล่นครั้งเดียว (.animate-boss-hit/.animate-qmon-flinch) bake translate(-50%, var(--raid-ground-anchor))
              ไว้แค่ระหว่างเล่นเท่านั้น พอเล่นจบ (ไม่มี fill-mode forwards) transform จะ fallback
              กลับมาที่ inline style นี้ ถ้าไม่ตั้งไว้สไปรต์จะหลุดตำแหน่งหลัง animation จบ (เจอบั๊กจริง
              บอสหายไปหลังโดนตี)

              --raid-ground-anchor: ชดเชยขอบล่างโปร่งใสของไฟล์รูปที่ไม่เท่ากันในแต่ละสไปรต์ (เจอบั๊ก
              จริงบอส/Qmon "ลอย" ไม่เท่ากัน feedback pass 2026-08-08 รอบ 3) ปกติ anchor คือ -100%
              (ขอบล่างกล่อง = เส้นพื้น) แต่ถ้าไฟล์มีช่องว่างท้ายภาพ N% ต้อง anchor ที่ -(100-N)% แทน
              ถึงจะเป็นขอบล่างของ "ตัวละครที่มองเห็นจริง" ไม่ใช่ขอบล่างของ canvas ที่โปร่งใส ดูค่าที่วัด
              จริงใน spriteGroundOffsets.ts — set ผ่าน CSS custom property เพราะ keyframes ที่ใช้กับ
              animationClass (bake -100% ไว้ตรงๆ เดิม) ต้อง reference ตัวแปรเดียวกันด้วย ไม่งั้นสไปรต์ที่
              กำลัง bob/breathe/hit จะขยับกลับไปที่ -100% เดิมระหว่างเล่น ไม่ตรงกับตอนนิ่ง */}
          <div
            className={`absolute ${sprite.animationClass ?? ""}`}
            style={
              {
                left: `${sprite.leftPercent}%`,
                top: "82%",
                height: `${sprite.heightPercent}%`,
                "--raid-ground-anchor": `-${100 - getSpriteGroundOffsetPercent(sprite.imagePath)}%`,
                transform: "translate(-50%, var(--raid-ground-anchor))",
              } as CSSProperties
            }
          >
            <Image
              src={sprite.imagePath}
              alt={sprite.alt ?? ""}
              width={220}
              height={220}
              className={`h-full w-auto object-contain drop-shadow-lg ${sprite.flip ? "-scale-x-100" : ""}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
