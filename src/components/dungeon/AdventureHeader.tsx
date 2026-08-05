"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// หัวจอ /adventure ทุกสถานะ (A/B/C) — แก้บั๊กทางตัน: เดิมไม่มีทางออกจากหน้านี้ในตัวหน้าเองเลย
// ต้องพึ่งแถบเมนูล่างอย่างเดียว ปุ่มนี้ "ย้อนกลับ" ไม่ใช่ "ยกเลิก" — กดแล้วแค่ออกจากหน้า รันยังเดิน
// ต่อตามปกติ ไม่แตะ dungeon_runs ใดๆ
//
// ⚠️ router.push() อย่างเดียว ห้ามตามด้วย router.refresh() — คู่นี้ทำให้ UI ค้างใน Next.js canary
// build ที่โปรเจกต์นี้ใช้
// หัว 2 บรรทัด — บรรทัดบน "‹ บ้าน" (chevron+คำติดกัน ไม่ใช่ปุ่มกลมไอคอนเดี่ยวเหมือนรอบก่อน ซึ่งไม่สื่อว่า
// กดแล้วไปไหน) ใช้คำ "บ้าน" ให้ตรงกับ label เดียวกันในแถบเมนูล่าง (BottomNav.tsx) บรรทัดล่างชื่อดันเจี้ยน
// ตัวใหญ่กว่าเป็นหัวข้อหลักของจอ
export default function AdventureHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => router.push("/pet")}
        className="flex h-11 min-w-11 items-center gap-1 self-start rounded-full border border-gold-dim bg-track px-3 text-sm font-medium text-text2 transition active:scale-95"
      >
        <ChevronLeft size={18} />
        <span>บ้าน</span>
      </button>
      <h1 className="text-xl font-bold text-gold-hi">{title}</h1>
      {subtitle && <p className="text-sm text-text3">{subtitle}</p>}
    </div>
  );
}
