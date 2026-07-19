"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PersonalityDecisionModal from "@/components/PersonalityDecisionModal";

// เคสที่ต้องจัดการ: stage=4 แต่ personality=null (ปิดแอป/รีเฟรชกลางคันก่อนตอบคำถามตอน
// StageUpModal ครั้งแรก) — แสดงสถานะรอตอบคำถามแทนที่จะปล่อยให้ PetCard ปกติพัง/โชว์เรดาร์เพี้ยน
export default function PendingPersonalityCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-amber-dim bg-card p-6 text-center">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className="h-2.5 w-2.5 rounded-full bg-amber" />
        ))}
      </div>
      <p className="text-4xl">⏳</p>
      <h2 className="text-lg font-bold text-gold-hi">Qmon โตครบระยะแล้ว รอเลือกบุคลิก</h2>
      <p className="text-sm text-text3">
        ตอบคำถาม 1 ข้อเพื่อกำหนดบุคลิกและเผยร่างสมบูรณ์ของ Qmon ตัวนี้ให้เสร็จก่อน ถึงจะเล่นต่อได้
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full max-w-xs rounded-2xl border border-gold bg-amber py-3 text-lg font-bold text-track shadow-lg transition active:scale-95"
      >
        กลับไปตอบคำถาม
      </button>

      {open && (
        <PersonalityDecisionModal
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
