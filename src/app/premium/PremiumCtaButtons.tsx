"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Share } from "lucide-react";
import Toast from "@/components/social/Toast";

const PRIMARY_CLASS =
  "relative flex h-14 items-center justify-center rounded-[18px] bg-(--hero-cta-bg) text-lg font-bold text-(--hero-cta-text) shadow-[0_5px_0_var(--hero-cta-shadow)] transition active:translate-y-0.5 active:shadow-[0_3px_0_var(--hero-cta-shadow)] disabled:opacity-70";

// ปุ่มจ่ายเงิน 2 ปุ่ม — "ปลดล็อกพรีเมียม" สร้าง order + Stripe Checkout (เฟส 4) แล้วพาไปหน้าจ่ายของ Stripe
// ส่วน "ส่งลิงก์ให้ผู้ปกครองจ่าย" ยังไม่เปิด (ขึ้น toast "เร็วๆ นี้" เหมือนเดิม)
// เฟส 4.1: มี order pending ของตัวเองใน 30 นาที (pendingOrderId) → ปุ่มหลักเป็น "ดูสถานะการชำระเงิน"
// และย้าย checkout ไปเป็นลิงก์เล็ก "ยังไม่ได้จ่าย? เริ่มใหม่" — กันจ่ายซ้ำโดยไม่ตั้งใจ
export default function PremiumCtaButtons({ pendingOrderId }: { pendingOrderId: string | null }) {
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
      {pendingOrderId ? (
        <>
          <Link href={`/premium/success?order=${pendingOrderId}`} className={PRIMARY_CLASS}>
            ดูสถานะการชำระเงิน
          </Link>
          <button
            type="button"
            onClick={startCheckout}
            disabled={loading}
            aria-busy={loading}
            className="-mt-1 min-h-11 text-sm text-text2 underline underline-offset-2 disabled:opacity-70"
          >
            {loading ? "กำลังเปิดหน้าจ่ายเงิน…" : "ยังไม่ได้จ่าย? เริ่มใหม่"}
          </button>
        </>
      ) : (
        <button type="button" onClick={startCheckout} disabled={loading} aria-busy={loading} className={PRIMARY_CLASS}>
          {loading ? "กำลังเปิดหน้าจ่ายเงิน…" : "ปลดล็อกพรีเมียม"}
        </button>
      )}
      <p className="-mt-1 text-center text-xs text-text3">จ่ายเสร็จแล้วกลับมาที่ QuizMon ได้เลย ระบบจะปลดล็อกให้อัตโนมัติ</p>
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
