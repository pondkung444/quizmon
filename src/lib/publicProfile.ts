import type { createClient } from "@/lib/supabase/server";
import type { PetPreview } from "@/components/social/petSummary";
import type { RelationshipStatus } from "@/app/social/actions";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PublicMedal = { id: string; name: string; tier: string; imageFile: string };

export type PublicProfileResult =
  | { found: false }
  | {
      found: true;
      relationshipStatus: RelationshipStatus;
      targetUserId: string;
      username: string;
      pet: PetPreview;
      medals: PublicMedal[];
      likeCount: number;
      likedByMe: boolean;
    };

// S04 (§5.2) — RPC เดียวจัดการทั้งบล็อก (คืนแบบเดียวกับ "ไม่พบ") และคำนวณ relationship_status
// ด้วย helper เดียวกับ search_friend_code (เฟส 3) ไม่มี logic ซ้ำฝั่ง client
export async function getPublicProfile(
  supabase: SupabaseServerClient,
  targetUserId: string
): Promise<PublicProfileResult> {
  const { data, error } = await supabase.rpc("get_public_profile", { p_target_user_id: targetUserId }).single();
  if (error || !data) throw new Error(error?.message ?? "โหลดโปรไฟล์ไม่สำเร็จ");

  const row = data as {
    found: boolean;
    relationship_status: RelationshipStatus | null;
    target_user_id: string | null;
    username: string | null;
    pet_nickname: string | null;
    pet_stage: number | null;
    pet_subline: string | null;
    pet_personality: string | null;
    egg_sprite_prefix: string | null;
    egg_name_th: string | null;
    medals: PublicMedal[] | null;
    like_count: number | null;
    liked_by_me: boolean | null;
  };

  if (!row.found) return { found: false };

  return {
    found: true,
    relationshipStatus: row.relationship_status as RelationshipStatus,
    targetUserId: row.target_user_id as string,
    username: row.username as string,
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
    medals: row.medals ?? [],
    likeCount: row.like_count ?? 0,
    likedByMe: row.liked_by_me ?? false,
  };
}
