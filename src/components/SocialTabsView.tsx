"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SegmentedTabs from "@/components/SegmentedTabs";
import MyProfileTab, { type ProfileTabData } from "@/components/social/MyProfileTab";

const TABS = [
  { key: "ranking", label: "อันดับ" },
  { key: "friends", label: "เพื่อน" },
  { key: "profile", label: "โปรไฟล์" },
];

const PLACEHOLDER_TEXT: Record<string, string> = {
  ranking: "อันดับ — เร็วๆ นี้",
  friends: "เพื่อน — เร็วๆ นี้",
};

// อันดับ/เพื่อน ยังเป็นโครงเปล่า (มาเฟส 8, 3) — โปรไฟล์เป็นเนื้อหาจริงตั้งแต่เฟส 2 ต้อง fetch
// ฝั่งเซิร์ฟเวอร์ (RLS) จึงรับ profileData มาจาก social/page.tsx แทนที่จะ fetch เองในนี้ (client)
// สลับแท็บด้วย state ในตัว ไม่รอ round-trip แล้วค่อย sync query param ไว้เผื่อแชร์ลิงก์/refresh
export default function SocialTabsView({
  initialTab,
  profileData,
}: {
  initialTab: string;
  profileData: ProfileTabData;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(initialTab);

  function handleChange(key: string) {
    setActiveTab(key);
    router.replace(`/social?tab=${key}`, { scroll: false });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SegmentedTabs tabs={TABS} activeKey={activeTab} onChange={handleChange} />
      {activeTab === "profile" ? (
        <MyProfileTab data={profileData} />
      ) : (
        <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          {PLACEHOLDER_TEXT[activeTab]}
        </p>
      )}
    </div>
  );
}
