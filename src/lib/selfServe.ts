import { createClient, getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// คู่ขนานกับ getGuardianAccess() (src/lib/guardian.ts) — เช็คว่านักเรียนที่ล็อกอินอยู่มี
// self_serve_enrollment ที่ active + ยังไม่หมดอายุไหม (pilot: ปอนด์ enroll ผ่าน SQL เท่านั้น ไม่มี UI ขอเอง)
// อ่านตรงผ่าน RLS policy self_serve_enrollment_select_own (auth.uid() = student_id) ไม่ต้องผ่าน RPC
// ชั้น UI นี้เป็น double-gate: RPC guardian_* ฝั่ง DB เช็ค enrollment ซ้ำอยู่แล้ว
export type SelfServeAccess =
  | { status: "unauthenticated" }
  | { status: "not_enrolled"; userId: string }
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

  if (!data) return { status: "not_enrolled", userId: user.id };
  return { status: "ok", userId: user.id };
}

// สถานะพรีเมียมพร้อมวันหมดอายุ — ใช้กับการ์ดหน้า /pet (3 สถานะ) และหน้า /premium
// เงื่อนไข "มีสิทธิ์" ตรงกับ getSelfServeAccess() เป๊ะ (active + now() < expires_at) แถว active ที่เลยเวลาแล้ว
// (ยังไม่ถูกเปลี่ยน status) นับเป็น "ไม่มีสิทธิ์" ทันที — downgrade มีผล ณ วินาทีที่หมดอายุ
export type PremiumStatus =
  | { status: "unauthenticated" }
  | { status: "none"; userId: string }
  | { status: "active"; userId: string; expiresAt: string };

export async function getPremiumStatus(): Promise<PremiumStatus> {
  const user = await getUser();
  if (!user) return { status: "unauthenticated" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("self_serve_enrollment")
    .select("expires_at")
    .eq("student_id", user.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return { status: "none", userId: user.id };
  return { status: "active", userId: user.id, expiresAt: data.expires_at as string };
}

// order ล่าสุดของผู้ใช้ภายใน RECENT_ORDER_WINDOW_MS — ใช้แสดงแถบบน /pet และ /premium (เฟส 4.1)
// เพราะจ่าย PromptPay บนมือถือเครื่องเดียว แท็บ Stripe มักค้างที่หน้า QR ไม่ redirect ไป success_url
// ผู้ใช้จึงต้องเห็นสถานะเองเมื่อกลับมาที่แอป — อ่านจาก DB เท่านั้น (RLS premium_orders_select_own + eq student_id ซ้ำ)
// granted (นับจาก granted_at) มาก่อน pending (นับจาก created_at)
export type RecentPremiumOrder =
  | { status: "pending"; orderId: string }
  | { status: "granted"; orderId: string; expiresAt: string | null };

const RECENT_ORDER_WINDOW_MS = 30 * 60 * 1000;

export async function getRecentPremiumOrder(userId: string): Promise<RecentPremiumOrder | null> {
  const since = new Date(Date.now() - RECENT_ORDER_WINDOW_MS).toISOString();
  const supabase = await createClient();

  const { data: granted } = await supabase
    .from("premium_orders")
    .select("id, expires_after")
    .eq("student_id", userId)
    .eq("status", "granted")
    .gte("granted_at", since)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (granted) {
    return { status: "granted", orderId: granted.id as string, expiresAt: granted.expires_after as string | null };
  }

  const { data: pending } = await supabase
    .from("premium_orders")
    .select("id")
    .eq("student_id", userId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending) return { status: "pending", orderId: pending.id as string };

  return null;
}

// ข้อมูลนักเรียนเจ้าของบัญชีสำหรับหน้า /my-plan/* — เรียกหลัง layout เช็ค getSelfServeAccess() แล้ว
// อ่าน profiles ด้วย admin client ตาม pattern getGradeBand() (RLS ของ profiles เคยคืน null เงียบๆ จาก session client)
// เฉพาะแถวของ userId ตัวเองเท่านั้น
export async function getSelfServeStudent(userId: string): Promise<{ studentId: string; username: string }> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("username").eq("id", userId).single();
  return { studentId: userId, username: data?.username ?? "" };
}
