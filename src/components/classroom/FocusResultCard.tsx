"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { FocusResult } from "@/app/teacher/focusActions";
import { FOCUS_DAILY_EXP_CAP } from "@/lib/exp";

// ผลคาบตั้งใจของตัวเอง (เห็นคนเดียว ไม่มีของเพื่อน) — โชว์ที่หน้าห้องทันทีที่ครูหยุดคาบ
export default function FocusResultCard({ result, onClose }: { result: FocusResult; onClose: () => void }) {
  const minutes = Math.round(result.focusedSeconds / 60);
  const capped = result.hasPet && result.expEarned > result.expAwarded;

  let note: string;
  if (result.completedBlocks === 0) {
    note = "ยังไม่ครบรอบ 10 นาทีต่อเนื่อง — คาบหน้าลองวางมือถือให้นิ่งตั้งแต่ต้นนะ";
  } else if (!result.hasPet) {
    note = "ยังไม่มี Qmon ที่กำลังเลี้ยง EXP รอบนี้จึงยังไม่เข้าตัวไหน";
  } else if (capped) {
    note = `วันนี้ได้ EXP จากคาบตั้งใจครบ ${FOCUS_DAILY_EXP_CAP} แล้ว`;
  } else {
    note = "EXP เข้า Qmon ที่กำลังเลี้ยงแล้ว";
  }

  return (
    <section className="relative w-full rounded-3xl border border-gold-dim bg-card p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute right-3 top-3 rounded-full p-1 text-text3 transition active:scale-90"
      >
        <X size={18} />
      </button>
      <p className="text-xs text-text3">คาบตั้งใจจบแล้ว</p>
      <div className="mt-2 flex items-end gap-4">
        <div>
          <p className="font-mono text-3xl font-bold text-gold-hi">+{result.expAwarded}</p>
          <p className="text-xs text-text3">EXP</p>
        </div>
        <div className="pb-1 text-sm text-text2">
          ตั้งใจครบ {result.completedBlocks} รอบ · {minutes} นาที
        </div>
      </div>
      <p className="mt-2 text-xs text-text2">{note}</p>
      {result.evolution?.evolved && (
        <Link
          href="/pet"
          className="mt-3 block rounded-xl border border-gold bg-amber px-4 py-2 text-center text-sm font-bold text-on-amber transition active:scale-95"
        >
          Qmon วิวัฒนาการแล้ว! ไปดูกัน
        </Link>
      )}
    </section>
  );
}
