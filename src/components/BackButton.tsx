"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// ใช้ history.back() แทน hardcode ปลายทางเดียว เพราะหน้านี้เข้าถึงได้จาก 2 context:
// จากหน้า /settings (ล็อกอินแล้ว) และจากฟอร์มสมัครสมาชิก/complete-profile (ยังไม่ล็อกอิน)
export default function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="กลับ"
      className="flex h-8 w-8 items-center justify-center text-text2"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}
