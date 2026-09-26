import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DAILY_EXP_CAP } from "@/lib/exp";

// เพดาน EXP รายวันของ "ผู้ใช้คนนั้น" สำหรับการแสดงผลเท่านั้น — การบังคับเพดานจริงอยู่ใน DB
// (award_quiz_exp อ่าน get_daily_exp_cap) ไฟล์นี้ไม่เปลี่ยนการให้ EXP
// get_daily_exp_cap เรียกได้เฉพาะ service_role → ต้องผ่าน admin client ฝั่ง server เท่านั้น
// FREE = DAILY_EXP_CAP (exp.ts) / PREMIUM = ค่านี้ ต้องตรงกับใน SQL
export const PREMIUM_DAILY_EXP_CAP = 300;

// .in() ยาวเกินไปจะชน URL length ของ PostgREST — แบ่งทีละก้อน
const IDS_CHUNK_SIZE = 200;

export async function getDailyExpCap(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_daily_exp_cap", { p_user_id: userId });
  if (error || typeof data !== "number") {
    console.error("getDailyExpCap failed:", error ?? `unexpected data: ${JSON.stringify(data)}`);
    return DAILY_EXP_CAP;
  }
  return data;
}

// สำหรับ push ที่มีผู้รับหลายคน — query เดียว (ต่อก้อน) แทนการยิง RPC ทีละคน
// ตรรกะต้องตรงกับ get_daily_exp_cap ใน
// supabase/migrations/20260925153832_premium_1_5c_award_quiz_exp.sql:
// มี self_serve_enrollment status='active' และ now() < expires_at → PREMIUM, ไม่งั้น FREE
// error → คืน FREE ทุกคน (ไม่ throw ไม่ให้ push ทั้งรอบล่ม)
export async function getDailyExpCaps(userIds: string[]): Promise<Map<string, number>> {
  const caps = new Map<string, number>(userIds.map((id) => [id, DAILY_EXP_CAP]));
  if (userIds.length === 0) return caps;

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const premiumIds = new Set<string>();

  for (let i = 0; i < userIds.length; i += IDS_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + IDS_CHUNK_SIZE);
    const { data, error } = await admin
      .from("self_serve_enrollment")
      .select("student_id")
      .in("student_id", chunk)
      .eq("status", "active")
      .gt("expires_at", nowIso);
    if (error) {
      console.error("getDailyExpCaps failed:", error);
      return new Map(userIds.map((id) => [id, DAILY_EXP_CAP]));
    }
    for (const row of data ?? []) premiumIds.add(row.student_id as string);
  }

  for (const id of premiumIds) caps.set(id, PREMIUM_DAILY_EXP_CAP);
  return caps;
}
