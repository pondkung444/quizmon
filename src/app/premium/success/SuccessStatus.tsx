"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Loader2, XCircle } from "lucide-react";

export type OrderView =
  | { status: "pending" }
  | { status: "granted"; expiresAt: string | null }
  | { status: "failed" }
  | { status: "not_found" };

const POLL_MS = 3_000;
const POLL_LIMIT_MS = 60_000;

const CTA_CLASS =
  "flex min-h-11 w-full items-center justify-center rounded-2xl bg-(--hero-cta-bg) px-4 py-3 text-base font-bold text-(--hero-cta-text) shadow-[0_4px_0_var(--hero-cta-shadow)]";

// pending → router.refresh() ทุก ~3 วิ (server page อ่าน DB ใหม่) จนกว่า webhook จะ grant หรือครบเพดาน 60 วิ
export default function SuccessStatus({ view }: { view: OrderView }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const pending = view.status === "pending";

  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [pending, router]);

  if (view.status === "granted") {
    const until = view.expiresAt
      ? new Date(view.expiresAt).toLocaleDateString("th-TH", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Bangkok",
        })
      : null;
    return (
      <Card>
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold">
          <Crown className="h-7 w-7 text-on-amber" strokeWidth={2.4} />
        </span>
        <p className="text-lg font-bold text-text">ปลดล็อกพรีเมียมแล้ว!</p>
        {until && <p className="text-sm text-text2">ใช้ได้ถึง {until}</p>}
        <Link href="/my-plan" className={CTA_CLASS}>
          ไปที่แผนของฉัน
        </Link>
      </Card>
    );
  }

  if (view.status === "pending") {
    return (
      <Card>
        <Loader2 className="h-10 w-10 animate-spin text-gold" />
        <p className="text-lg font-bold text-text">กำลังยืนยันการชำระเงิน</p>
        {timedOut ? (
          <>
            <p className="text-sm text-text2">ใช้เวลานานกว่าปกติ รอสักครู่แล้วกดรีเฟรชนะ ถ้าจ่ายแล้วสิทธิ์จะขึ้นเอง</p>
            <button type="button" onClick={() => window.location.reload()} className={CTA_CLASS}>
              รีเฟรช
            </button>
          </>
        ) : (
          <p className="text-sm text-text2">ถ้าสแกนจ่ายแล้ว รอสักครู่ ไม่ต้องปิดหน้านี้</p>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <XCircle className="h-10 w-10 text-text3" />
      <p className="text-lg font-bold text-text">
        {view.status === "failed" ? "การชำระเงินไม่สำเร็จ" : "ไม่พบคำสั่งซื้อนี้"}
      </p>
      {view.status === "failed" && <p className="text-sm text-text2">ยังไม่มีการตัดเงิน ลองใหม่ได้เลย</p>}
      <Link href="/premium" className={CTA_CLASS}>
        ลองใหม่
      </Link>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-[22px] border border-border bg-card p-6 text-center">
      {children}
    </div>
  );
}
