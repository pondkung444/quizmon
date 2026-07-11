import Image from "next/image";

export default function SpeechBubble({
  message,
  avatarPath,
}: {
  message: string | null;
  // ใส่ path รูปมอนตัว active เพื่อโชว์ avatar เล็กข้าง bubble (ใช้ตอนไม่มีตัวสัตว์ตัวเต็มอยู่ในจอ
  // เช่น /quiz) — เว้นว่างไว้ (undefined) ถ้าจอนั้นมีตัวสัตว์ตัวเต็มโชว์อยู่แล้ว เช่น /pet
  avatarPath?: string | null;
}) {
  if (!message) return null;

  return (
    <div className="animate-speech-pop flex items-end gap-2">
      {avatarPath && (
        <Image
          src={avatarPath}
          alt="ภาพ Qmon"
          width={44}
          height={44}
          className="shrink-0 rounded-full border border-gold-dim bg-track"
        />
      )}
      <div className="max-w-[200px] rounded-2xl border border-gold-dim bg-card px-3 py-2 text-xs text-text2 shadow-lg">
        {message}
      </div>
    </div>
  );
}
