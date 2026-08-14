import { createClient, getUser } from "@/lib/supabase/server";
import { getProfileJourneyStats } from "@/lib/profileJourneyStats";
import { getFriendRequestLists, getFriendCount } from "@/lib/friendRequests";
import type { AchievementCardData, AchievementTier } from "@/components/AchievementCard";
import type { PetSummary } from "@/components/social/petSummary";
import type { EquippedGearSummary, ProfileTabData } from "@/components/social/MyProfileTab";
import type { FriendsHeaderData } from "@/components/social/FriendsTabHeader";
import SocialTabsView from "@/components/SocialTabsView";
import SignOutLink from "@/components/SignOutLink";

const VALID_TABS = ["ranking", "friends", "profile"];

function formatBangkokDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

type PetRow = {
  id: string;
  nickname: string | null;
  stage: number;
  subline: string | null;
  personality: string | null;
  is_active: boolean;
  stat_hp: number | null;
  stat_atk: number | null;
  stat_def: number | null;
  stat_spd: number | null;
  stat_foc: number | null;
  evolved_at: string | null;
  growth_questions_answered: number | null;
  growth_questions_correct: number | null;
  growth_subject_breakdown: Record<string, { answered: number; correct: number }> | null;
  egg_types: { sprite_prefix: string; name_th: string } | { sprite_prefix: string; name_th: string }[] | null;
};

function toPetSummary(row: PetRow): PetSummary | null {
  const eggType = Array.isArray(row.egg_types) ? row.egg_types[0] : row.egg_types;
  if (!eggType) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    stage: row.stage,
    subline: row.subline,
    personality: row.personality,
    isActive: row.is_active,
    statHp: row.stat_hp,
    statAtk: row.stat_atk,
    statDef: row.stat_def,
    statSpd: row.stat_spd,
    statFoc: row.stat_foc,
    evolvedAt: row.evolved_at,
    growthQuestionsAnswered: row.growth_questions_answered,
    growthQuestionsCorrect: row.growth_questions_correct,
    growthSubjectBreakdown: row.growth_subject_breakdown,
    eggSpritePrefix: eggType.sprite_prefix,
    eggNameTh: eggType.name_th,
  };
}

async function getProfileTabData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ProfileTabData> {
  const [{ data: profileRow }, { data: petRows }, { data: settingsRow }, { data: earnedRows }, { data: pinnedRows }] =
    await Promise.all([
      supabase.from("profiles").select("username").eq("id", userId).maybeSingle(),
      supabase
        .from("pets")
        .select(
          "id, nickname, stage, subline, personality, is_active, stat_hp, stat_atk, stat_def, stat_spd, stat_foc, evolved_at, growth_questions_answered, growth_questions_correct, growth_subject_breakdown, egg_types(sprite_prefix, name_th)"
        )
        .eq("user_id", userId)
        .or("is_active.eq.true,stage.eq.4"),
      supabase.from("profile_settings").select("pride_pet_id, favorite_pet_ids").eq("user_id", userId).maybeSingle(),
      supabase
        .from("user_achievements")
        .select(
          "achievement_id, earned_at, achievement_definitions(id, name, condition_text, tier, image_file)"
        )
        .eq("user_id", userId),
      supabase
        .from("user_pinned_achievements")
        .select("achievement_id, pin_order")
        .eq("user_id", userId)
        .order("pin_order", { ascending: true }),
    ]);

  const prideCandidates = (petRows ?? [])
    .map((row) => toPetSummary(row as PetRow))
    .filter((p): p is PetSummary => !!p);
  const activePet = prideCandidates.find((p) => p.isActive) ?? null;

  const candidateIds = prideCandidates.map((p) => p.id);
  const { data: gearRows } = candidateIds.length
    ? await supabase
        .from("raid_gear_items")
        .select("slot, quality, equipped_pet_id")
        .eq("owner_user_id", userId)
        .in("equipped_pet_id", candidateIds)
    : { data: [] as { slot: string; quality: string; equipped_pet_id: string | null }[] };

  const equippedGearByPetId: Record<string, EquippedGearSummary[]> = {};
  for (const row of gearRows ?? []) {
    if (!row.equipped_pet_id) continue;
    const list = equippedGearByPetId[row.equipped_pet_id] ?? (equippedGearByPetId[row.equipped_pet_id] = []);
    list.push({ slot: row.slot as EquippedGearSummary["slot"], quality: row.quality });
  }

  const earnedAchievements: AchievementCardData[] = (earnedRows ?? [])
    .map((row) => {
      const def = Array.isArray(row.achievement_definitions)
        ? row.achievement_definitions[0]
        : row.achievement_definitions;
      if (!def) return null;
      const card: AchievementCardData = {
        id: def.id,
        name: def.name,
        conditionText: def.condition_text,
        tier: def.tier as AchievementTier,
        imageFile: def.image_file,
        progressMetric: null,
        progressTarget: null,
        currentValue: null,
        earned: true,
        earnedAtLabel: formatBangkokDate(row.earned_at),
        earnedByLabel: null,
      };
      return card;
    })
    .filter((c): c is AchievementCardData => !!c);

  const journeyStats = await getProfileJourneyStats(supabase, userId);

  return {
    username: profileRow?.username ?? "ผู้เล่น",
    pridePetIdSetting: settingsRow?.pride_pet_id ?? null,
    activePetId: activePet?.id ?? null,
    favoritePetIdsSetting: settingsRow?.favorite_pet_ids ?? [],
    pinnedAchievementIdsSetting: (pinnedRows ?? []).map((row) => row.achievement_id),
    prideCandidates,
    earnedAchievements,
    journeyStats,
    equippedGearByPetId,
  };
}

async function getFriendsHeaderData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<FriendsHeaderData> {
  const [friendCount, { received }, { data: profileRow }] = await Promise.all([
    getFriendCount(supabase, userId),
    getFriendRequestLists(supabase),
    supabase.from("profiles").select("friend_code").eq("id", userId).maybeSingle(),
  ]);
  return {
    friendCount,
    receivedRequestCount: received.length,
    myFriendCode: profileRow?.friend_code ?? "",
  };
}

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = VALID_TABS.includes(tab ?? "") ? (tab as string) : "ranking";

  const user = await getUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 pb-24">
        <SignOutLink />
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูหน้าสังคม
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const [profileData, friendsHeaderData] = await Promise.all([
    getProfileTabData(supabase, user.id),
    getFriendsHeaderData(supabase, user.id),
  ]);

  return (
    <SocialTabsView initialTab={initialTab} profileData={profileData} friendsHeaderData={friendsHeaderData} />
  );
}
