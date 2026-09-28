"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// เช็กโปรไฟล์ไม่ครบ (username / grade_level) ซ้ำทุกครั้งที่เปลี่ยนหน้าฝั่ง client — root layout เช็ก
// ได้แค่ตอน full load (ไม่ re-render ตอน soft-nav) เลยหนีจาก complete-profile ได้ผ่าน Link/back/forward
// flag มาจาก layout (คำนวณตอน full load) — หลังกรอกเสร็จ /login/continue เป็น route handler → full
// navigation → layout คำนวณใหม่ flag จึงไม่ค้าง
// path ที่ยกเว้นต้องตรงกับเงื่อนไข redirect ใน layout.tsx
const EXEMPT_PREFIXES = ["/login", "/guardian", "/privacy"];

export default function ProfileGate({ incomplete }: { incomplete: boolean }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const blocked = incomplete && !EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (blocked) router.replace("/login/complete-profile");
  }, [blocked, router]);

  // บังหน้าปลายทางไว้จนกว่า redirect เสร็จ (ไม่ให้เห็นหน้าแวบ) — z-[95] ต่ำกว่า guest gate (z-[100])
  return blocked ? <div aria-hidden className="fixed inset-0 z-[95] bg-bg" /> : null;
}
