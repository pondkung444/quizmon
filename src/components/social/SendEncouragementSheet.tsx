"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import BottomSheet from "@/components/social/BottomSheet";
import { sendEncouragement } from "@/app/social/actions";
import { ENCOURAGEMENT_MESSAGE_KEYS, ENCOURAGEMENT_MESSAGES } from "@/lib/encouragementMessages";

// เลือกข้อความสำเร็จรูป 1 ใน 4 แบบแล้วส่งทันที ไม่มีปุ่มยืนยันซ้อน (§8.2) — reuse BottomSheet
// (เฟส 2) ตรงตาม pattern "เลือกจากลิสต์สั้นๆ" เดิม
export default function SendEncouragementSheet({
  recipientId,
  onSent,
  onClose,
}: {
  recipientId: string;
  onSent: () => void;
  onClose: () => void;
}) {
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSelect(messageKey: (typeof ENCOURAGEMENT_MESSAGE_KEYS)[number]) {
    if (isSending) return;
    setIsSending(true);
    setErrorMessage(null);
    try {
      await sendEncouragement(recipientId, messageKey);
      onSent();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "ส่งกำลังใจไม่สำเร็จ");
      setIsSending(false);
    }
  }

  return (
    <BottomSheet title="ส่งกำลังใจ" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {ENCOURAGEMENT_MESSAGE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={isSending}
            onClick={() => handleSelect(key)}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-gold-dim bg-track px-4 text-left text-sm font-bold text-text transition active:scale-95 disabled:opacity-50"
          >
            <Heart className="h-4 w-4 flex-none text-amber" />
            {ENCOURAGEMENT_MESSAGES[key]}
          </button>
        ))}
        {errorMessage && <p className="text-center text-sm text-red">{errorMessage}</p>}
      </div>
    </BottomSheet>
  );
}
