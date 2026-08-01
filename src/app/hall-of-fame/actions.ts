"use server";

import { createClient } from "@/lib/supabase/server";
import { getHallOfFamePage, type HallOfFamePage } from "@/lib/hallOfFame";

// เรียกตอนกด "โหลดเพิ่ม" ใน HallOfFameList.tsx — throw ถ้าไม่มี session ตาม pattern เดียวกับ
// action อื่นๆ ของ weekly leaderboard (getWeeklyLeaderboardTop5 ใน app/pet/actions.ts)
export async function loadMoreHallOfFame(weeksOffset: number): Promise<HallOfFamePage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  return getHallOfFamePage(supabase, weeksOffset);
}
