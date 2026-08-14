import type { createClient } from "@/lib/supabase/server";
import type { PetPreview } from "@/components/social/petSummary";
import type { PublicMedal } from "@/lib/publicProfile";
import type { ProfileJourneyStats } from "@/lib/profileJourneyStats";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FriendGearItem = {
  slot: "head" | "body" | "feet";
  quality: string;
  mainStat: "hp" | "atk" | "def" | "spd";
  mainValue: number;
};

export type FriendProfileResult =
  | { found: false }
  | {
      found: true;
      friendUserId: string;
      username: string;
      school: string | null;
      gradeLevel: string | null;
      pet: PetPreview;
      stats: { hp: number; atk: number; def: number; spd: number; foc: number } | null;
      gear: FriendGearItem[];
      medals: PublicMedal[];
      favoritePets: NonNullable<PetPreview>[];
      journeyStats: ProfileJourneyStats;
      likeCount: number;
      likedByMe: boolean;
    };

// S05 เต็มรูปแบบ (เฟส 6) — ต่างจาก get_public_profile (เฟส 5) ตรงที่ RPC เช็คว่าเป็นเพื่อนกันจริงก่อน
// คืนข้อมูล คืนแบบเดียวกับ "ไม่พบ" ถ้าไม่ใช่เพื่อน (defensive แม้ route จะกันไว้ชั้นหนึ่งแล้ว)
export async function getFriendProfile(
  supabase: SupabaseServerClient,
  friendUserId: string
): Promise<FriendProfileResult> {
  const { data, error } = await supabase.rpc("get_friend_profile", { p_friend_user_id: friendUserId }).single();
  if (error || !data) throw new Error(error?.message ?? "โหลดโปรไฟล์เพื่อนไม่สำเร็จ");

  const row = data as {
    found: boolean;
    friend_user_id: string | null;
    username: string | null;
    school: string | null;
    grade_level: string | null;
    pet_nickname: string | null;
    pet_stage: number | null;
    pet_subline: string | null;
    pet_personality: string | null;
    egg_sprite_prefix: string | null;
    egg_name_th: string | null;
    stat_hp: number | null;
    stat_atk: number | null;
    stat_def: number | null;
    stat_spd: number | null;
    stat_foc: number | null;
    gear: FriendGearItem[] | null;
    medals: PublicMedal[] | null;
    favorite_pets: NonNullable<PetPreview>[] | null;
    training_days: number | null;
    questions_answered: number | null;
    stage4_pet_count: number | null;
    unique_evolution_patterns: number | null;
    top_challenge_cleared: string | null;
    weekly_champion_count: number | null;
    like_count: number | null;
    liked_by_me: boolean | null;
  };

  if (!row.found) return { found: false };

  const hasFullStats =
    row.stat_hp != null && row.stat_atk != null && row.stat_def != null && row.stat_spd != null && row.stat_foc != null;

  return {
    found: true,
    friendUserId: row.friend_user_id as string,
    username: row.username as string,
    school: row.school,
    gradeLevel: row.grade_level,
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
    stats: hasFullStats
      ? {
          hp: row.stat_hp as number,
          atk: row.stat_atk as number,
          def: row.stat_def as number,
          spd: row.stat_spd as number,
          foc: row.stat_foc as number,
        }
      : null,
    gear: row.gear ?? [],
    medals: row.medals ?? [],
    favoritePets: row.favorite_pets ?? [],
    journeyStats: {
      trainingDays: row.training_days ?? 0,
      questionsAnswered: row.questions_answered ?? 0,
      stage4PetCount: row.stage4_pet_count ?? 0,
      uniqueEvolutionPatterns: row.unique_evolution_patterns ?? 0,
      topChallengeCleared: row.top_challenge_cleared,
      weeklyChampionCount: row.weekly_champion_count ?? 0,
    },
    likeCount: row.like_count ?? 0,
    likedByMe: row.liked_by_me ?? false,
  };
}
