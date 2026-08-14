import type { createClient } from "@/lib/supabase/server";
import type { PetPreview } from "@/components/social/petSummary";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FriendListItem = {
  friendUserId: string;
  username: string;
  school: string | null;
  gradeLevel: string | null;
  friendsSince: string;
  pet: PetPreview;
};

export type BlockedAccountItem = {
  blockedUserId: string;
  username: string;
  pet: PetPreview;
  blockedAt: string;
};

type PetPreviewRow = {
  pet_nickname: string | null;
  pet_stage: number | null;
  pet_subline: string | null;
  pet_personality: string | null;
  egg_sprite_prefix: string | null;
  egg_name_th: string | null;
};

function toPetPreview(row: PetPreviewRow): PetPreview {
  if (!row.egg_sprite_prefix || !row.egg_name_th || row.pet_stage == null) return null;
  return {
    nickname: row.pet_nickname,
    stage: row.pet_stage,
    subline: row.pet_subline,
    personality: row.pet_personality,
    eggSpritePrefix: row.egg_sprite_prefix,
    eggNameTh: row.egg_name_th,
  };
}

type FriendRow = PetPreviewRow & {
  friend_user_id: string;
  username: string;
  school: string | null;
  grade_level: string | null;
  friends_since: string;
};

// ใช้ RPC เสมอ (ไม่ query profiles ตรง) — RLS ของ profiles เปิดแค่แถวตัวเอง เพื่อนคนอื่นอ่านตรงไม่ได้
export async function getMyFriends(supabase: SupabaseServerClient): Promise<FriendListItem[]> {
  const { data, error } = await supabase.rpc("list_my_friends");
  if (error) throw new Error("โหลดรายชื่อเพื่อนไม่สำเร็จ: " + error.message);

  return ((data ?? []) as FriendRow[]).map((row) => ({
    friendUserId: row.friend_user_id,
    username: row.username,
    school: row.school,
    gradeLevel: row.grade_level,
    friendsSince: row.friends_since,
    pet: toPetPreview(row),
  }));
}

type BlockedRow = PetPreviewRow & {
  blocked_user_id: string;
  username: string;
  blocked_at: string;
};

export async function getMyBlockedAccounts(supabase: SupabaseServerClient): Promise<BlockedAccountItem[]> {
  const { data, error } = await supabase.rpc("list_my_blocked_accounts");
  if (error) throw new Error("โหลดรายชื่อที่บล็อกไม่สำเร็จ: " + error.message);

  return ((data ?? []) as BlockedRow[]).map((row) => ({
    blockedUserId: row.blocked_user_id,
    username: row.username,
    blockedAt: row.blocked_at,
    pet: toPetPreview(row),
  }));
}
