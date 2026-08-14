"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SegmentedTabs from "@/components/SegmentedTabs";
import MyProfileTab, { type ProfileTabData } from "@/components/social/MyProfileTab";
import FriendsTabHeader, { type FriendsHeaderData } from "@/components/social/FriendsTabHeader";
import RankingTabView from "@/components/social/RankingTabView";
import type { RankingData } from "@/lib/ranking";

const TABS = [
  { key: "ranking", label: "อันดับ" },
  { key: "friends", label: "เพื่อน" },
  { key: "profile", label: "โปรไฟล์" },
];

// เพื่อน (ส่วนหัว, เฟส 3) โปรไฟล์ (เฟส 2) และอันดับ (เฟส 8) เป็นเนื้อหาจริงแล้วทั้ง 3 แท็บ ต้อง
// fetch ฝั่งเซิร์ฟเวอร์ (RLS) จึงรับข้อมูลมาจาก social/page.tsx แทนที่จะ fetch เองในนี้ (client)
// สลับแท็บด้วย state ในตัว ไม่รอ round-trip แล้วค่อย sync query param ไว้เผื่อแชร์ลิงก์/refresh
// อันดับ initial data เป็นแค่หมวดเดียว (weekly_training/all) — สลับหมวด/ขอบเขตอื่นให้ RankingTabView
// เรียก loadRanking (server action) เองตอนคลิก ไม่ prefetch ล่วงหน้าทั้ง 8 ชุด
export default function SocialTabsView({
  initialTab,
  profileData,
  friendsHeaderData,
  initialRankingData,
}: {
  initialTab: string;
  profileData: ProfileTabData;
  friendsHeaderData: FriendsHeaderData;
  initialRankingData: RankingData;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(initialTab);

  // ลิงก์ตรงไป /social?tab=X จากแท็บอื่น (เช่น แถวตัวเองในอันดับขอบเขตเพื่อน → /social?tab=profile)
  // เป็นแค่ query param เปลี่ยนบนเส้นทางเดิม ไม่ทำให้ SocialTabsView remount ใหม่ — activeTab ที่เป็น
  // local state ค้างค่าจาก initialTab เฉยๆ ถ้าไม่ sync ตรงนี้ ต้องฟัง searchParams เพิ่มเพื่อสลับแท็บ
  // ให้ถูกจริง ไม่ใช่แค่พึ่ง SegmentedTabs onChange อย่างเดียว
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && TABS.some((t) => t.key === tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleChange(key: string) {
    setActiveTab(key);
    router.replace(`/social?tab=${key}`, { scroll: false });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
      <SegmentedTabs tabs={TABS} activeKey={activeTab} onChange={handleChange} />
      {activeTab === "profile" ? (
        <MyProfileTab data={profileData} />
      ) : activeTab === "friends" ? (
        <FriendsTabHeader data={friendsHeaderData} />
      ) : (
        <RankingTabView
          initialCategory="weekly_training"
          initialScope="all"
          initialData={initialRankingData}
          friendCount={friendsHeaderData.friendCount}
        />
      )}
    </div>
  );
}
