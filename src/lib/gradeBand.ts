import { createAdminClient } from "@/lib/supabase/admin";

export type GradeBand = "junior" | "senior";

const VISIBLE: Record<GradeBand, GradeBand[]> = {
  junior: ["junior"],
  senior: ["senior"],
};

// ต้องใช้ admin client อ่าน profiles.grade_band เสมอ ไม่ใช่ user-session client
// (RLS ของ profiles เคยทำให้ query จาก client ปกติเงียบๆ คืน null แทน error)
export async function getGradeBand(userId: string): Promise<GradeBand> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("grade_band").eq("id", userId).single();
  return (data?.grade_band as GradeBand) ?? "junior";
}

export const visibleBands = (band: GradeBand) => VISIBLE[band];
