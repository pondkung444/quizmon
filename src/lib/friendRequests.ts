import type { createClient } from "@/lib/supabase/server";
import type { PetPreview } from "@/components/social/petSummary";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FriendRequestItem = {
  requestId: string;
  otherUserId: string;
  username: string;
  pet: PetPreview;
  createdAt: string;
};

export type FriendRequestLists = {
  received: FriendRequestItem[];
  sent: FriendRequestItem[];
};

type FriendRequestRow = {
  direction: string;
  request_id: string;
  other_user_id: string;
  username: string;
  pet_nickname: string | null;
  pet_stage: number | null;
  pet_subline: string | null;
  pet_personality: string | null;
  egg_sprite_prefix: string | null;
  egg_name_th: string | null;
  created_at: string;
};

function toItem(row: FriendRequestRow): FriendRequestItem {
  return {
    requestId: row.request_id,
    otherUserId: row.other_user_id,
    username: row.username,
    pet:
      row.egg_sprite_prefix && row.egg_name_th && row.pet_stage != null
        ? {
            nickname: row.pet_nickname,
            stage: row.pet_stage,
            subline: row.pet_subline,
            personality: row.pet_personality,
            eggSpritePrefix: row.egg_sprite_prefix,
            eggNameTh: row.egg_name_th,
          }
        : null,
    createdAt: row.created_at,
  };
}

// ใช้ร่วมกันระหว่างส่วนหัวแท็บ "เพื่อน" (แค่นับจำนวน) กับหน้า /social/requests (S07, ต้องการลิสต์
// เต็ม) — เรียก RPC เดียวกันครั้งเดียว list_my_friend_requests() คืนมาทั้ง 2 ทิศทางในตารางเดียว
export async function getFriendRequestLists(supabase: SupabaseServerClient): Promise<FriendRequestLists> {
  const { data, error } = await supabase.rpc("list_my_friend_requests");
  if (error) throw new Error("โหลดคำขอเป็นเพื่อนไม่สำเร็จ: " + error.message);

  const rows = (data ?? []) as FriendRequestRow[];
  return {
    received: rows.filter((r) => r.direction === "received").map(toItem),
    sent: rows.filter((r) => r.direction === "sent").map(toItem),
  };
}

export async function getFriendCount(supabase: SupabaseServerClient, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("friend_ids", { p_user_id: userId });
  if (error) throw new Error("โหลดจำนวนเพื่อนไม่สำเร็จ: " + error.message);
  return (data ?? []).length;
}
