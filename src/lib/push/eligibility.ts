import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/exp";

type AdminClient = ReturnType<typeof createAdminClient>;

export type EligibleRecipient = {
  userId: string;
  devices: { token: string; platform: "android" | "ios"; deviceId: string }[];
  pet: {
    nickname: string;
    stage: number;
    /** exp_today ที่ normalize แล้ว — ถ้า exp_today_date ไม่ใช่วันนี้ (เวลาไทย) ถือว่าเป็น 0 */
    expToday: number;
  } | null;
};

const RECENT_ACTIVITY_WINDOW_MINUTES = 30;

/**
 * หา user ที่เข้าเงื่อนไขรับ push รอบนี้:
 * - push_enabled=true และ preferenceColumn ที่ระบุ=true
 * - มี push_devices ที่ enabled=true อย่างน้อย 1 เครื่อง
 * - ไม่ active ใน quiz_attempts ช่วง 30 นาทีที่ผ่านมา (suppress ไม่ให้ push ทับตอนกำลังเล่นอยู่)
 *
 * ไม่กรอง platform เลย — ส่งให้ทุกเครื่องที่ enabled อยู่ไม่ว่า android/ios
 */
export async function getEligibleRecipients(
  admin: AdminClient,
  preferenceColumn: "daily_quest_enabled" | "daily_exp_enabled"
): Promise<EligibleRecipient[]> {
  const { data: prefs, error: prefsError } = await admin
    .from("push_preferences")
    .select("user_id")
    .eq("push_enabled", true)
    .eq(preferenceColumn, true);
  if (prefsError) throw prefsError;

  const candidateUserIds = (prefs ?? []).map((p) => p.user_id as string);
  if (candidateUserIds.length === 0) return [];

  const { data: devices, error: devicesError } = await admin
    .from("push_devices")
    .select("id, user_id, fcm_token, platform")
    .eq("enabled", true)
    .in("user_id", candidateUserIds);
  if (devicesError) throw devicesError;

  const deviceMap = new Map<string, EligibleRecipient["devices"]>();
  for (const d of devices ?? []) {
    const list = deviceMap.get(d.user_id as string) ?? [];
    list.push({ token: d.fcm_token as string, platform: d.platform as "android" | "ios", deviceId: d.id as string });
    deviceMap.set(d.user_id as string, list);
  }

  const userIdsWithDevice = Array.from(deviceMap.keys());
  if (userIdsWithDevice.length === 0) return [];

  const sinceIso = new Date(Date.now() - RECENT_ACTIVITY_WINDOW_MINUTES * 60_000).toISOString();
  const { data: recentActivity, error: activityError } = await admin
    .from("quiz_attempts")
    .select("user_id")
    .in("user_id", userIdsWithDevice)
    .gte("created_at", sinceIso);
  if (activityError) throw activityError;

  const recentlyActive = new Set((recentActivity ?? []).map((r) => r.user_id as string));
  const finalUserIds = userIdsWithDevice.filter((id) => !recentlyActive.has(id));
  if (finalUserIds.length === 0) return [];

  const { data: pets, error: petsError } = await admin
    .from("pets")
    .select("user_id, nickname, stage, exp_today, exp_today_date")
    .eq("is_active", true)
    .in("user_id", finalUserIds);
  if (petsError) throw petsError;

  const today = getTodayInBangkok();
  const petMap = new Map<string, EligibleRecipient["pet"]>();
  for (const p of pets ?? []) {
    const expTodayDate = p.exp_today_date as string;
    petMap.set(p.user_id as string, {
      nickname: p.nickname as string,
      stage: p.stage as number,
      expToday: expTodayDate === today ? (p.exp_today as number) : 0,
    });
  }

  return finalUserIds.map((userId) => ({
    userId,
    devices: deviceMap.get(userId) ?? [],
    pet: petMap.get(userId) ?? null,
  }));
}
