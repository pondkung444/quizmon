import "server-only";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FarmAttention } from "./attention";
const missing = (code?: string) =>
  ["42P01", "42883", "PGRST202", "PGRST205"].includes(code ?? "");
export async function loadFarmAttention(): Promise<FarmAttention | null> {
  const user = await getUser();
  if (!user) return null;
  const r = await createAdminClient().rpc("farm_attention", {
    p_user: user.id,
  });
  if (r.error && missing(r.error.code)) return null;
  if (r.error) throw Error("โหลดแจ้งเตือนฟาร์มไม่สำเร็จ");
  return r.data as FarmAttention;
}
export async function farmNotificationPreference(
  enabled?: boolean,
): Promise<boolean | null> {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  if (enabled !== undefined && typeof enabled !== "boolean")
    throw Error("เลือกการตั้งค่าให้ถูกต้อง");
  const r = await createAdminClient().rpc("farm_notification_preference", {
    p_user: user.id,
    p_enabled: enabled ?? null,
  });
  if (enabled === undefined && r.error && missing(r.error.code)) return null;
  if (r.error) throw Error("บันทึกการแจ้งเตือนไม่สำเร็จ");
  return r.data as boolean;
}
