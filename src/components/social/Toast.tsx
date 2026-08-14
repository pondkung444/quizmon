"use client";

import { useEffect } from "react";

// ป้ายยืนยันชั่วคราวลอยเหนือ BottomNav (z-40) — ใช้กับ B02/B03/B04 หลังบันทึกสำเร็จ ไม่มี
// toast library ในโปรเจกต์มาก่อน นี่คือจุดแรก จงใจให้เรียบง่ายที่สุดพอ ไม่ผูก state ไว้ที่นี่
export default function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-6">
      <div className="rounded-full border border-gold bg-card px-4 py-2 text-sm font-bold text-gold-hi shadow-lg">
        {message}
      </div>
    </div>
  );
}
