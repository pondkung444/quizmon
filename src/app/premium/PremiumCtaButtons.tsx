"use client";

import { useCallback, useState } from "react";
import { Share } from "lucide-react";
import Toast from "@/components/social/Toast";

// ปุ่มจ่ายเงิน 2 ปุ่ม — ยังไม่เชื่อมระบบจ่ายเงิน (Stripe = เฟส 4) หน้าตาเหมือนพร้อมใช้งาน แต่กดแล้วแค่ขึ้น
// toast "เร็วๆ นี้" ห้ามลิงก์ไป checkout ใดๆ จนกว่าเฟส 4 จะมา (ตอนนั้นแทน onClick ด้วยการสร้าง order จริง)
export default function PremiumCtaButtons() {
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const comingSoon = () => setToast("ระบบจ่ายเงินเปิดเร็วๆ นี้ 🙏");

  return (
    <>
      <button
        type="button"
        aria-disabled="true"
        onClick={comingSoon}
        className="relative h-14 rounded-[18px] bg-(--hero-cta-bg) text-lg font-bold text-(--hero-cta-text) shadow-[0_5px_0_var(--hero-cta-shadow)] transition active:translate-y-0.5 active:shadow-[0_3px_0_var(--hero-cta-shadow)]"
      >
        ปลดล็อกพรีเมียม
        <span className="absolute -top-2 right-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-on-amber shadow">
          เร็วๆ นี้
        </span>
      </button>
      <button
        type="button"
        aria-disabled="true"
        onClick={comingSoon}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-gold-dim text-[15px] font-medium text-text transition active:scale-[0.99]"
      >
        <Share className="h-[18px] w-[18px]" />
        ส่งลิงก์ให้ผู้ปกครองจ่าย
      </button>
      {toast && <Toast message={toast} onDone={clearToast} />}
    </>
  );
}
