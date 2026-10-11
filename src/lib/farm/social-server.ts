import "server-only";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FarmTile } from "./world";
import type { FarmPlace, ProjectDefinition } from "./catalogue";
import { FARM_STICKERS, type FarmSticker } from "./social";
export type FriendFarm = {
  username: string;
  tiles: FarmTile[];
  places: {
    id: string;
    kind: FarmPlace;
    level: number;
    completedAt: string | null;
    contributors: {
      name: string;
      role: string;
      joinedAt: string | null;
      leftAt: string | null;
    }[];
  }[];
  catalogue: {
    id: string;
    enabled: boolean;
    definition: Omit<ProjectDefinition, "id">;
  }[];
  sentToday: boolean;
  remainingToday: number;
};
export type StickerDay = {
  day: string;
  total: number;
  unread: number;
  stickers: Partial<Record<FarmSticker, number>>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = (code?: string) =>
  ["42P01", "PGRST205", "42883", "PGRST202"].includes(code ?? "");
export async function farmSocialAvailable() {
  const user = await getUser();
  if (!user) return false;
  const r = await createAdminClient()
    .from("farm_social_settings")
    .select("user_id")
    .eq("user_id", user.id)
    .limit(1);
  if (r.error && missing(r.error.code)) return false;
  if (r.error) throw Error("ตรวจระบบเยี่ยมฟาร์มไม่สำเร็จ");
  return true;
}
export async function loadFriendFarm(
  owner: string,
): Promise<FriendFarm | null> {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  if (!uuid.test(owner)) return null;
  const r = await createAdminClient().rpc("farm_visit_snapshot", {
    p_viewer: user.id,
    p_owner: owner,
  });
  if (
    r.error &&
    (missing(r.error.code) || r.error.message.includes("ไม่สามารถเยี่ยม"))
  )
    return null;
  if (r.error) throw Error("โหลดฟาร์มเพื่อนไม่สำเร็จ");
  return r.data as FriendFarm;
}
export async function visitPreference(enabled?: boolean) {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  if (enabled !== undefined && typeof enabled !== "boolean")
    throw Error("เลือกการตั้งค่าให้ถูกต้อง");
  const r = await createAdminClient().rpc("farm_visit_preference", {
    p_user: user.id,
    p_enabled: enabled ?? null,
  });
  if (r.error) throw Error("บันทึกการเปิดเยี่ยมไม่สำเร็จ");
  return r.data as boolean;
}
export async function sendFarmSticker(
  owner: string,
  sticker: FarmSticker,
  request: string,
) {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  if (
    !uuid.test(owner) ||
    !uuid.test(request) ||
    !FARM_STICKERS.some((s) => s.id === sticker)
  )
    throw Error("เลือกสติกเกอร์และเพื่อนให้ถูกต้อง");
  const r = await createAdminClient().rpc("farm_sticker_send", {
    p_sender: user.id,
    p_recipient: owner,
    p_sticker: sticker,
    p_request: request,
  });
  if (r.error)
    throw Error(
      /^(ส่งกำลังใจครบ|ไม่สามารถส่ง|คำขอส่ง)/.test(r.error.message)
        ? r.error.message
        : "ส่งกำลังใจไม่สำเร็จ ลองสติกเกอร์เดิมอีกครั้งได้",
    );
  const latest = await loadFriendFarm(owner);
  return {
    ...r.data,
    sentToday: latest?.sentToday ?? true,
    remainingToday: latest?.remainingToday ?? 0,
  } as {
    created: boolean;
    id: string;
    day: string;
    sentToday: boolean;
    remainingToday: number;
  };
}
export async function farmStickerInbox(
  markRead = false,
): Promise<StickerDay[]> {
  const user = await getUser();
  if (!user) throw Error("ต้องเข้าสู่ระบบก่อน");
  if (typeof markRead !== "boolean") throw Error("เลือกสถานะอ่านให้ถูกต้อง");
  const r = await createAdminClient().rpc("farm_sticker_inbox", {
    p_user: user.id,
    p_mark_read: markRead,
  });
  if (r.error) throw Error("โหลดกำลังใจฟาร์มไม่สำเร็จ");
  return r.data as StickerDay[];
}
