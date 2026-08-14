import type { createClient } from "@/lib/supabase/server";
import type { PetPreview } from "@/components/social/petSummary";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RankingCategory = "weekly_training" | "consistency" | "achievement" | "collector";
export type RankingScope = "all" | "friends";

export type RankingRow = {
  rank: number | null;
  userId: string;
  username: string;
  pet: PetPreview;
  scoreValue: number | null;
  isMe: boolean;
};

export type MyRankInfo = { found: false } | { found: true; rank: number; scoreValue: number };

export type RankingData = {
  rows: RankingRow[];
  // null = ไม่จำเป็นต้องโชว์การ์ด "อันดับของคุณ" (scope=friends หรือแถวตัวเองอยู่ในรายการที่เห็นแล้ว)
  myRank: MyRankInfo | null;
};

type RankingRpcRow = {
  rank: number | null;
  user_id: string;
  username: string;
  pet_nickname: string | null;
  pet_stage: number | null;
  pet_subline: string | null;
  pet_personality: string | null;
  egg_sprite_prefix: string | null;
  egg_name_th: string | null;
  score_value: number | null;
  is_me: boolean;
};

function toPetPreview(row: {
  pet_nickname: string | null;
  pet_stage: number | null;
  pet_subline: string | null;
  pet_personality: string | null;
  egg_sprite_prefix: string | null;
  egg_name_th: string | null;
}): PetPreview {
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

// S01 (§9) — get_ranking คืน top 50 (scope=all) หรือทุกคน (scope=friends) การ์ด "อันดับของคุณ" ต้อง
// โชว์เฉพาะตอน scope=all และแถวตัวเองไม่อยู่ในรายการที่เห็น (§9.6) เลยต้องเรียก get_my_rank เพิ่ม
// เฉพาะตอนนั้นเท่านั้น — ไม่ query คนรอบข้าง ตามที่ RPC ออกแบบไว้
export async function getRanking(
  supabase: SupabaseServerClient,
  category: RankingCategory,
  scope: RankingScope
): Promise<RankingData> {
  const { data, error } = await supabase.rpc("get_ranking", { p_category: category, p_scope: scope });
  if (error) throw new Error("โหลดอันดับไม่สำเร็จ: " + error.message);

  const rows: RankingRow[] = ((data ?? []) as RankingRpcRow[]).map((row) => ({
    rank: row.rank,
    userId: row.user_id,
    username: row.username,
    pet: toPetPreview(row),
    scoreValue: row.score_value,
    isMe: row.is_me,
  }));

  let myRank: MyRankInfo | null = null;
  if (scope === "all" && !rows.some((r) => r.isMe)) {
    const { data: myData, error: myError } = await supabase
      .rpc("get_my_rank", { p_category: category, p_scope: scope })
      .single();
    if (myError || !myData) throw new Error(myError?.message ?? "โหลดอันดับของคุณไม่สำเร็จ");
    const myRow = myData as { found: boolean; rank: number | null; score_value: number | null };
    myRank = myRow.found ? { found: true, rank: myRow.rank as number, scoreValue: myRow.score_value as number } : { found: false };
  }

  return { rows, myRank };
}
