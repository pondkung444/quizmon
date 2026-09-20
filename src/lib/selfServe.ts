import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// คู่ขนานกับ getGuardianAccess() (src/lib/guardian.ts) — เช็คว่านักเรียนที่ล็อกอินอยู่มี
// self_serve_enrollment ที่ active + ยังไม่หมดอายุไหม (pilot: ปอนด์ enroll ผ่าน SQL เท่านั้น ไม่มี UI ขอเอง)
// อ่านตรงผ่าน RLS policy self_serve_enrollment_select_own (auth.uid() = student_id) ไม่ต้องผ่าน RPC
// ชั้น UI นี้เป็น double-gate: RPC guardian_* ฝั่ง DB เช็ค enrollment ซ้ำอยู่แล้ว
export type SelfServeAccess =
  | { status: "unauthenticated" }
  | { status: "not_enrolled" }
  | { status: "ok"; userId: string };

export async function getSelfServeAccess(): Promise<SelfServeAccess> {
  const user = await getUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("self_serve_enrollment")
    .select("id")
    .eq("student_id", user.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return { status: "not_enrolled" };
  return { status: "ok", userId: user.id };
}

// ข้อมูลนักเรียนเจ้าของบัญชีสำหรับหน้า /my-plan/* — เรียกหลัง layout เช็ค getSelfServeAccess() แล้ว
// อ่าน profiles ด้วย admin client ตาม pattern getGradeBand() (RLS ของ profiles เคยคืน null เงียบๆ จาก session client)
// เฉพาะแถวของ userId ตัวเองเท่านั้น
export async function getSelfServeStudent(userId: string): Promise<{ studentId: string; username: string }> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("username").eq("id", userId).single();
  return { studentId: userId, username: data?.username ?? "" };
}
