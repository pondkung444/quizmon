import type { createClient } from "@/lib/supabase/server";
import { getTodayInBangkok } from "@/lib/exp";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ProfileJourneyStats = {
  trainingDays: number;
  questionsAnswered: number;
  stage4PetCount: number;
  uniqueEvolutionPatterns: number;
  topChallengeCleared: string | null; // null = ยังไม่เคยพิชิต challenge ไหนเลย
  weeklyChampionCount: number;
};

// normalize เดียวกับ _eval_collection() ใน supabase/migrations/20260813214417_...sql เป๊ะ —
// ห้ามแก้ mapping นี้แยกจากกัน ไม่งั้นตัวเลข "รูปแบบวิวัฒนาการที่ค้นพบ" จะไม่ตรงกับที่ปลดล็อกเหรียญจริง
function normalizedSubline(subline: string | null): string | null {
  if (subline === "physics") return "math";
  if (subline === "chemistry") return "balanced";
  if (subline === "biology") return "science";
  return subline;
}

// query logic รวมไว้จุดเดียวเพื่อให้เฟส 6 (โปรไฟล์เพื่อน) เรียกซ้ำได้ — นิยามสถิติยึดตามระบบ
// Achievement เดิม (_eval_training/_eval_collection ฯลฯ) ตามที่ระบุใน design doc §4.5 ห้ามคิดนิยามใหม่
export async function getProfileJourneyStats(
  supabase: SupabaseServerClient,
  userId: string
): Promise<ProfileJourneyStats> {
  const [
    { data: attemptRows },
    { count: questionsAnswered },
    { data: stage4Pets },
    { data: wins },
    { count: weeklyChampionCount },
  ] = await Promise.all([
    supabase.from("quiz_attempts").select("created_at").eq("user_id", userId),
    supabase.from("quiz_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("pets").select("egg_type_id, subline, personality").eq("user_id", userId).eq("stage", 4),
    supabase
      .from("raid_runs")
      .select("raid_types(name_th, sort_order)")
      .eq("user_id", userId)
      .eq("outcome", "win"),
    supabase
      .from("weekly_leaderboard_rewards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const trainingDays = new Set(
    (attemptRows ?? []).map((row) => getTodayInBangkok(new Date(row.created_at)))
  ).size;

  const patternKeys = new Set(
    (stage4Pets ?? []).map(
      (p) => `${p.egg_type_id}|${normalizedSubline(p.subline)}|${p.personality}`
    )
  );

  let topChallengeCleared: string | null = null;
  let topSortOrder = -1;
  for (const win of wins ?? []) {
    const raidType = Array.isArray(win.raid_types) ? win.raid_types[0] : win.raid_types;
    if (raidType && raidType.sort_order > topSortOrder) {
      topSortOrder = raidType.sort_order;
      topChallengeCleared = raidType.name_th;
    }
  }

  return {
    trainingDays,
    questionsAnswered: questionsAnswered ?? 0,
    stage4PetCount: stage4Pets?.length ?? 0,
    uniqueEvolutionPatterns: patternKeys.size,
    topChallengeCleared,
    weeklyChampionCount: weeklyChampionCount ?? 0,
  };
}
