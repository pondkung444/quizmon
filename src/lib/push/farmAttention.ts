import { createAdminClient } from "@/lib/supabase/admin";
import { isWithinQuietHours } from "./quietHours";
import { dispatchNotifications } from "./dispatchNotifications";
import type { EligibleRecipient } from "./eligibility";
export async function dispatchFarmAttention(
  admin: ReturnType<typeof createAdminClient>,
) {
  if (isWithinQuietHours()) return { skipped: "quiet-hours" };
  const r = await admin.rpc("farm_notification_recipients");
  if (
    r.error &&
    ["42P01", "42883", "PGRST202", "PGRST205"].includes(r.error.code)
  )
    return { skipped: "not-installed" };
  if (r.error) throw Error("โหลดผู้รับแจ้งเตือนฟาร์มไม่สำเร็จ");
  const recipients: EligibleRecipient[] = (r.data ?? []).map(
    (row: {
      user_id: string;
      device_id: string;
      token: string;
      platform: "android" | "ios";
    }) => ({
      userId: row.user_id,
      devices: [
        { deviceId: row.device_id, token: row.token, platform: row.platform },
      ],
      pet: null,
      dailyCap: 0,
    }),
  );
  return dispatchNotifications(admin, "farm_attention", recipients, () => ({
    title: "มีเรื่องใหม่ในฟาร์ม",
    body: "งานอาจต้องการความช่วยเหลือ สถานที่พร้อมวาง หรือมีกำลังใจใหม่ แวะดูเมื่อสะดวกนะ",
    deepLink: "/collection",
  }));
}
export async function safeDispatchFarmAttention(
  admin: ReturnType<typeof createAdminClient>,
) {
  try {
    return await dispatchFarmAttention(admin);
  } catch {
    return { error: "farm-notification-failed" };
  }
}
