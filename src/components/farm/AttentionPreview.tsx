"use client";
import BottomNav from "@/components/BottomNav";
import FarmStartGuide from "./FarmStartGuide";
export default function AttentionPreview() {
  return (
    <main className="mx-auto max-w-xl p-4 pb-24">
      <p>ข้อมูลจำลองแจ้งเตือนและทางนำ ไม่มีการส่ง push</p>
      <FarmStartGuide ready={false} />
      <FarmStartGuide ready />
      <BottomNav />
    </main>
  );
}
