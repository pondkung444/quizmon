import Image from "next/image";
import EvolutionGlow from "@/components/EvolutionGlow";

export default function SpeechBubble({
  message,
  avatarPath,
  evolutionProgress = 0,
  dailyCapped = false,
  variant = "inline",
  isTyping = false,
}: {
  // message เป็น null ได้ตอน isTyping=true (ยังไม่มีข้อความจริง แค่โชว์ typing indicator)
  message: string | null;
  // ใส่ path รูปมอนตัว active เพื่อโชว์ avatar เล็กข้าง/เหนือ bubble (ใช้ตอนไม่มีตัวสัตว์ตัวเต็มอยู่
  // ในจอ เช่น /quiz) — เว้นว่างไว้ (undefined) ถ้าจอนั้นมีตัวสัตว์ตัวเต็มโชว์อยู่แล้ว เช่น /pet
  avatarPath?: string | null;
  // ผูกเอฟเฟกต์ "ใกล้วิวัฒนาการ" เดียวกับ PetCard เข้ากับ avatar เล็กนี้ (ดู EvolutionGlow.tsx)
  // ปล่อยว่าง = ไม่มีเอฟเฟกต์ (เช่นตอนเรียกจาก /pet ที่ไม่ส่ง avatarPath มาอยู่แล้ว)
  evolutionProgress?: number;
  dailyCapped?: boolean;
  // "inline" (ค่าเริ่มต้นเดิม) = avatar+bubble แนวนอนเรียงข้างกัน ใช้ที่ PetCard.tsx/QuizClient.tsx
  // อยู่แล้ว ห้ามเปลี่ยนพฤติกรรมเริ่มต้นนี้เด็ดขาด
  // "stacked" = avatar อยู่บน bubble อยู่ล่างมีหางชี้ขึ้นหา avatar — ใช้กับ QmonChatBubble.tsx
  // ที่อยากให้รู้สึกเหมือนแชทกับ Qmon จริงๆ
  variant?: "inline" | "stacked";
  // โชว์ typing indicator (จุดเด้ง 3 จุด) แทนข้อความ — ใช้ระหว่างรอผลลัพธ์จาก AI
  isTyping?: boolean;
}) {
  if (!message && !isTyping) return null;

  const avatar = avatarPath && (
    <EvolutionGlow progress={evolutionProgress} dailyCapped={dailyCapped}>
      <Image
        src={avatarPath}
        alt="ภาพ Qmon"
        width={44}
        height={44}
        className="shrink-0 rounded-full border border-gold-dim bg-track"
      />
    </EvolutionGlow>
  );

  const bubbleContent = isTyping ? <TypingDots /> : message;

  if (variant === "stacked") {
    return (
      <div className="animate-speech-pop flex flex-col items-center gap-1">
        {avatar}
        <div className="relative max-w-[240px] rounded-2xl border border-gold-dim bg-card px-3 py-2 text-xs text-text2 shadow-lg">
          {/* หางชี้ขึ้นหา avatar ด้านบน — สามเหลี่ยมจากสี่เหลี่ยมหมุน 45deg โชว์แค่ขอบบน-ซ้าย */}
          <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-gold-dim bg-card" />
          {bubbleContent}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-speech-pop flex items-end gap-2">
      {avatar}
      <div className="max-w-[200px] rounded-2xl border border-gold-dim bg-card px-3 py-2 text-xs text-text2 shadow-lg">
        {bubbleContent}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-text2" style={{ animationDelay: "0ms" }} />
      <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-text2" style={{ animationDelay: "150ms" }} />
      <span className="animate-typing-dot h-1.5 w-1.5 rounded-full bg-text2" style={{ animationDelay: "300ms" }} />
    </div>
  );
}
