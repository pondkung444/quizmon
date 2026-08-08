"use client";

import type { RaidView } from "@/lib/raid";
import RaidPreDeparture from "@/components/raid/RaidPreDeparture";
import RaidPathScreen from "@/components/raid/RaidPathScreen";
import RaidObstacleQuizScreen from "@/components/raid/RaidObstacleQuizScreen";
import RaidBossScreen from "@/components/raid/RaidBossScreen";
import RaidRewardScreen from "@/components/raid/RaidRewardScreen";

// จุดกระจายจอตาม phase ที่ page.tsx (server) เตรียมมาให้ — เหมือน AdventureClient.tsx ของ
// ผจญภัย ทุกจอเรียก server action แล้ว router.refresh() เพื่อให้ server คำนวณ phase ถัดไปให้เสมอ
// (ไม่เก็บ state ข้าม step ไว้ฝั่ง client) เพื่อให้ resume หลังปิดแอปกลางรอบตรงกับตอนเล่นสดเป๊ะ
export default function RaidClient({ view }: { view: RaidView }) {
  if (view.phase === "predeparture") return <RaidPreDeparture {...view} />;
  // key ด้วย runId+stepIndex+phase — router.refresh() เปลี่ยนแค่ props ไม่ remount component เดิม
  // ถ้าไม่ key ตรงนี้ local state ของสเต็ปก่อนหน้า (เช่น reveal ใน RaidPathScreen) จะค้างข้ามสเต็ป
  // ใหม่ (เจอจริงตอนทดสอบ: ด่านที่ 3 ยังโชว์ผลของด่านที่ 2 ค้างอยู่)
  if (view.phase === "choosing") return <RaidPathScreen key={`${view.runId}-${view.stepIndex}-choosing`} {...view} />;
  if (view.phase === "quiz") return <RaidObstacleQuizScreen key={`${view.runId}-${view.stepIndex}-quiz`} {...view} />;
  // เหตุผลเดียวกับด้านบน — key ด้วยจำนวนข้อที่ตอบไปแล้วด้วย ไม่งั้น selectedChoice/result ของข้อ
  // ก่อนหน้าจะค้างข้ามข้อใหม่ (เจอจริง: ข้อ 3 ยังโชว์ผลตอบถูกของข้อ 2 ค้างอยู่)
  if (view.phase === "boss") {
    const answeredCount = view.questions.filter((q) => q.answered).length;
    return <RaidBossScreen key={`${view.runId}-${answeredCount}`} {...view} />;
  }
  return <RaidRewardScreen key={view.runId} {...view} />;
}
