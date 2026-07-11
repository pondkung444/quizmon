import Image from "next/image";
import EvolutionGlow from "@/components/EvolutionGlow";

export default function SpeechBubble({
  message,
  avatarPath,
  evolutionProgress = 0,
  dailyCapped = false,
}: {
  message: string | null;
  // ใส่ path รูปมอนตัว active เพื่อโชว์ avatar เล็กข้าง bubble (ใช้ตอนไม่มีตัวสัตว์ตัวเต็มอยู่ในจอ
  // เช่น /quiz) — เว้นว่างไว้ (undefined) ถ้าจอนั้นมีตัวสัตว์ตัวเต็มโชว์อยู่แล้ว เช่น /pet
  avatarPath?: string | null;
  // ผูกเอฟเฟกต์ "ใกล้วิวัฒนาการ" เดียวกับ PetCard เข้ากับ avatar เล็กนี้ (ดู EvolutionGlow.tsx)
  // ปล่อยว่าง = ไม่มีเอฟเฟกต์ (เช่นตอนเรียกจาก /pet ที่ไม่ส่ง avatarPath มาอยู่แล้ว)
  evolutionProgress?: number;
  dailyCapped?: boolean;
}) {
  if (!message) return null;

  return (
    <div className="animate-speech-pop flex items-end gap-2">
      {avatarPath && (
        <EvolutionGlow progress={evolutionProgress} dailyCapped={dailyCapped}>
          <Image
            src={avatarPath}
            alt="ภาพ Qmon"
            width={44}
            height={44}
            className="shrink-0 rounded-full border border-gold-dim bg-track"
          />
        </EvolutionGlow>
      )}
      <div className="max-w-[200px] rounded-2xl border border-gold-dim bg-card px-3 py-2 text-xs text-text2 shadow-lg">
        {message}
      </div>
    </div>
  );
}
