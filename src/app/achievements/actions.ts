"use server";

import { createClient } from "@/lib/supabase/server";

// เรียกก่อนปิดโมดัลฉลองเสมอ (ไม่ใช่แค่ set state ปิด UI เฉยๆ) — idempotent ฝั่ง RPC เอง
// (set celebrated_at เฉพาะแถวที่ยังเป็น null) เรียกซ้ำ/พลาดกลางทางได้อย่างปลอดภัย
export async function markAchievementsCelebrated(achievementIds: string[]): Promise<void> {
  if (achievementIds.length === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const { error } = await supabase.rpc("mark_achievements_celebrated", {
    p_user_id: user.id,
    p_achievement_ids: achievementIds,
  });
  if (error) throw new Error(error.message);
}
