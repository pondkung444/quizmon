"use client";

import { useEffect } from "react";

export default function AnalyticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[admin/analytics] load failed", error); }, [error]);
  return <main className="mx-auto flex max-w-xl flex-col gap-4 p-6">
    <h1 className="text-xl font-bold text-gold-hi">โหลดข้อมูล Analytics ไม่สำเร็จ</h1>
    <p className="text-sm text-text3">ลองโหลดข้อมูลอีกครั้ง หากยังไม่สำเร็จ ให้แจ้งรหัสข้อผิดพลาดนี้เพื่อช่วยตรวจสอบ</p>
    {error.digest && <p className="text-xs text-text3">รหัส: {error.digest}</p>}
    <button type="button" onClick={reset} className="self-start rounded-lg bg-amber px-4 py-2 text-sm font-medium text-on-amber">ลองอีกครั้ง</button>
  </main>;
}
