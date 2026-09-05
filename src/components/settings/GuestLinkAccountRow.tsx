"use client";

import { useState } from "react";
import { ChevronRight, Link2 } from "lucide-react";
import GuestUpgradeGate from "@/components/GuestUpgradeGate";

// แถว "ผูกไอดี" ในเมนูตั้งค่า — เรนเดอร์เฉพาะ guest (settings/page.tsx เช็ค user.is_anonymous)
// เปิดโมดัลเดียวกับ hard gate แต่ปิดได้ (ส่ง `dismissible`) เพราะเป็นการเข้ามาเอง ไม่ได้ถูกบังคับ
// ผูกสำเร็จแล้ว logic เดิมใน layout จัดการต่อ (banner รอ confirm / school prompt / ตั้งรหัสผ่าน)
export default function GuestLinkAccountRow() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between py-3 text-sm text-text active:opacity-70"
      >
        <span className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-text3" />
          ผูกไอดี (เก็บ Qmon ไว้ถาวร)
        </span>
        <ChevronRight className="h-4 w-4 text-text3" />
      </button>
      {open && <GuestUpgradeGate petName="" dismissible={() => setOpen(false)} />}
    </>
  );
}
