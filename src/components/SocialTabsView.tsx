"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SegmentedTabs from "@/components/SegmentedTabs";

const TABS = [
  { key: "ranking", label: "อันดับ" },
  { key: "friends", label: "เพื่อน" },
  { key: "profile", label: "โปรไฟล์" },
];

const PLACEHOLDER_TEXT: Record<string, string> = {
  ranking: "อันดับ — เร็วๆ นี้",
  friends: "เพื่อน — เร็วๆ นี้",
  profile: "โปรไฟล์ — เร็วๆ นี้",
};

// เฟส 1 เป็นแค่โครงเปล่า — เนื้อหาจริงของแต่ละแท็บ (อันดับ/เพื่อน/โปรไฟล์) มาเฟส 2, 3, 8
// สลับแท็บด้วย state ในตัว ไม่ต้องรอ round-trip ไปเซิร์ฟเวอร์ (หน้านี้ไม่มี data fetch จริง) แล้วค่อย
// sync query param ไว้เผื่อแชร์ลิงก์/refresh กลับมาที่แท็บเดิม
export default function SocialTabsView({ initialTab }: { initialTab: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(initialTab);

  function handleChange(key: string) {
    setActiveTab(key);
    router.replace(`/social?tab=${key}`, { scroll: false });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SegmentedTabs tabs={TABS} activeKey={activeTab} onChange={handleChange} />
      <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
        {PLACEHOLDER_TEXT[activeTab]}
      </p>
    </div>
  );
}
