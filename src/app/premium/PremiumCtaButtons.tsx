"use client";

import { useCallback, useState } from "react";
import { Share } from "lucide-react";
import Toast from "@/components/social/Toast";

// ปุ่มจ่ายเงิน 2 ปุ่ม — "ปลดล็อกพรีเมียม" สร้าง order + Stripe Checkout (เฟส 4) แล้วพาไปหน้าจ่ายของ Stripe
// ส่วน "ส่งลิงก์ให้ผู้ปกครองจ่าย" ยังไม่เปิด (ขึ้น toast "เร็วๆ นี้" เหมือนเดิม)
export default function PremiumCtaButtons() {
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);
  const comingSoon = () => setToast("ระบบส่งลิงก์ให้ผู้ปกครองเปิดเร็วๆ นี้ 🙏");

  const startCheckout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/premium/checkout", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && data?.url) {
        // ไม่ปลด loading — กำลังออกจากหน้า กันกดซ้ำระหว่างรอ Stripe โหลด
        window.location.href = data.url;
        return;
      }
      setToast(data?.error ?? "เปิดหน้าจ่ายเงินไม่สำเร็จ ลองใหม่อีกครั้งนะ");
    } catch {
      setToast("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้งนะ");
    }
    setLoading(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        aria-busy={loading}
        className="relative h-14 rounded-[18px] bg-(--hero-cta-bg) text-lg font-bold text-(--hero-cta-text) shadow-[0_5px_0_var(--hero-cta-shadow)] transition active:translate-y-0.5 active:shadow-[0_3px_0_var(--hero-cta-shadow)] disabled:opacity-70"
      >
        {loading ? "กำลังเปิดหน้าจ่ายเงิน…" : "ปลดล็อกพรีเมียม"}
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
