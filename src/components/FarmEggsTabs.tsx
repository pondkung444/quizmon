"use client";

import { useRouter } from "next/navigation";
import SegmentedTabs from "@/components/SegmentedTabs";

const TABS = [
  { key: "farm", label: "ฟาร์ม" },
  { key: "eggs", label: "คลังไข่" },
];

const ROUTE_BY_KEY: Record<string, string> = {
  farm: "/collection",
  eggs: "/eggs",
};

// /collection กับ /eggs เป็นคนละ route กันตั้งแต่แรก (เก็บไว้ตามเดิมไม่ merge/redirect — กัน
// CollectPetButton.tsx และ analytics screen:"/eggs" พัง) แท็บนี้แค่สลับหน้าไปมาระหว่างสอง route
export default function FarmEggsTabs({ active }: { active: "farm" | "eggs" }) {
  const router = useRouter();

  return (
    <SegmentedTabs
      tabs={TABS}
      activeKey={active}
      onChange={(key) => router.push(ROUTE_BY_KEY[key])}
    />
  );
}
