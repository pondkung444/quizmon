import type { createClient } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import { STAGE_EXP_THRESHOLD, type Personality, type Subline } from "@/lib/evolution";
import type { RaidChapterList } from "@/components/raid/arena/chapters";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// null when the child has no grade band yet or the RPC fails: the prep screen asks them to set one.
export async function loadRaidChapters(supabase: SupabaseServerClient): Promise<RaidChapterList | null> {
  const { data, error } = await supabase.rpc("list_raid_chapters");
  if (error || !data) return null;
  const list = data as RaidChapterList;
  return { gradeLevel: list.gradeLevel ?? null, auto: list.auto ?? [], chapters: list.chapters ?? [] };
}

export type RaidNoPetInfo = { name: string; imagePath: string; stage: number; expLeft: number; progress: number } | null;

// The active Qmon for the "not grown yet" screen; read only, EXP rules stay in evolution.ts.
export async function getRaidNoPetInfo(supabase: SupabaseServerClient, userId: string): Promise<RaidNoPetInfo> {
  const { data } = await supabase
    .from("pets")
    .select("nickname, exp, stage, subline, personality, egg_types(sprite_prefix, name_th)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const egg = (Array.isArray(data.egg_types) ? data.egg_types[0] : data.egg_types) as { sprite_prefix: string; name_th: string } | null;
  if (!egg) return null;
  const stage = data.stage ?? 1;
  const goal = STAGE_EXP_THRESHOLD[3];
  const exp = data.exp ?? 0;
  try {
    const subline = (data.subline ?? null) as Subline | null;
    const personality = (data.personality ?? null) as Personality | null;
    return {
      name: data.nickname ?? getSpeciesName(egg.sprite_prefix, stage, subline, personality, egg.name_th),
      imagePath: getPetImagePath(egg.sprite_prefix, stage, subline, personality),
      stage,
      expLeft: Math.max(0, goal - exp),
      progress: Math.min(1, Math.max(0, exp / goal)),
    };
  } catch {
    return null;
  }
}
