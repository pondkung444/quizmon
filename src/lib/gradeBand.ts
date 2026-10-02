import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGradeBand } from "@/lib/gradeLevel";

// pure + test ได้ใน gradeLevel.ts (ไฟล์นี้ import admin client จึงรันใน node:test ตรงๆ ไม่ได้) — re-export ไว้ให้ใช้ที่เดียวกับ visibleBands
export { topicBandsFor, isTopicBandAllowed } from "@/lib/gradeLevel";

// primary = ป.4–6 (คณิต+วิทย์) — เนื้อหา/pet ฝั่ง client ใช้ชุดเดียวกับ junior แต่ถามโจทย์จาก grade_band = primary ตรงๆ
export type GradeBand = "primary" | "junior" | "senior";

const VISIBLE: Record<GradeBand, GradeBand[]> = {
  primary: ["primary"],
  junior: ["junior"],
  senior: ["senior"],
};

// ต้องใช้ admin client อ่าน profiles.grade_band เสมอ ไม่ใช่ user-session client
// (RLS ของ profiles เคยทำให้ query จาก client ปกติเงียบๆ คืน null แทน error)
export async function getGradeBand(userId: string): Promise<GradeBand> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("grade_band").eq("id", userId).single();
  // fallback เฉพาะค่า null/ไม่รู้จัก — 'primary' ต้องลอดผ่านตามจริง
  return normalizeGradeBand(data?.grade_band) ?? "junior";
}

export const visibleBands = (band: GradeBand) => VISIBLE[band];

// อ่าน grade_band + grade_level ในการ query เดียว (ใช้ admin client เหตุผลเดียวกับ getGradeBand ด้านบน)
// ระดับชั้นเชิงลึกกว่า band ใช้จำกัดโจทย์ junior ตามชั้น — ดู src/lib/gradeLevel.ts
export async function getGradeProfile(
  userId: string
): Promise<{ band: GradeBand; gradeLevel: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("grade_band, grade_level")
    .eq("id", userId)
    .single();
  return {
    band: normalizeGradeBand(data?.grade_band) ?? "junior",
    gradeLevel: data?.grade_level ?? null,
  };
}
