"use client";

import type { CSSProperties, ReactNode } from "react";

// ธรณีประตูที่เอฟเฟกต์ glow เริ่มปรากฏ — ต้องตรงกับตัวเลขใน globals.css (.evo-glow, clamp((--evo-progress - 0.7) ...))
// เก็บไว้ที่นี่แค่เพื่อตัดสินใจว่าจะ "พัลส์" หรือไม่ (state ไม่ต่อเนื่อง คำนวณใน CSS ล้วนๆ ไม่ได้)
// ส่วนความเข้มของ glow เองคำนวณอยู่ใน CSS ทั้งหมดจาก --evo-progress ตรงๆ ไม่ผูกกับค่านี้
const PULSE_START_PROGRESS = 0.7;

// ห่อรูปสัตว์ตัว active เพื่อใส่เอฟเฟกต์ "ใกล้วิวัฒนาการ" (glow ไล่ความเข้มตาม progress,
// พัลส์เมื่อ progress > 0.7) ใช้ที่เดียว ทั้ง PetCard (รูปเต็ม /pet) และ SpeechBubble avatar
// (ระหว่างตอบคำถามใน /quiz) กันไม่ให้ต้องคำนวณ/ก็อป CSS ซ้ำสองที่
export default function EvolutionGlow({
  progress,
  dailyCapped,
  children,
}: {
  progress: number; // 0-1 จาก getEvolutionProgress — 0 (เช่น stage 4 หรือเพิ่งขึ้นสเตจใหม่ๆ) = ไม่มีเอฟเฟกต์
  dailyCapped: boolean; // exp_today ตัน DAILY_EXP_CAP แล้ว -> glow นิ่ง ไม่พัลส์ กันเด็กงงว่าทำไมตอบถูกแล้วเอฟเฟกต์ไม่ขยับ
  children: ReactNode;
}) {
  const pulsing = progress > PULSE_START_PROGRESS && !dailyCapped;
  const style = { "--evo-progress": progress } as CSSProperties;

  return (
    <div className={`evo-glow${pulsing ? " evo-glow-pulse" : ""}`} style={style}>
      {children}
    </div>
  );
}
