import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LeaderboardEntry = {
  rnk: number;
  username: string;
  total_points: number;
  accuracy: number;
};

// band 'none' = ยังไม่มีแต้มสัปดาห์นี้เลย (RPC get_my_weekly_rank คืน 0 แถว) — ไม่ใช่ band ที่ backend
// ส่งมาตรงๆ (backend มีแค่ top/mid/start) แต่ derive ฝั่งนี้ให้ component แยกเคสง่ายขึ้น
export type MyWeeklyRank =
  | { hasRank: false }
  | {
      hasRank: true;
      inTop5: boolean;
      myRank: number;
      totalPlayers: number;
      band: "top" | "mid" | "start";
      points: number;
      pointsToNext: number | null;
    };

// ต้องรับ userId จาก caller ที่ดึงจาก session (server component/action) เท่านั้น — ฟังก์ชันนี้ไม่ auth.getUser()
// ซ้ำเอง และ RPC เองก็รับ p_user_id ตรงๆ ไม่เช็คว่าตรงกับ auth.uid() ของผู้เรียกหรือเปล่า (ดู migration
// get_my_weekly_rank) ดังนั้นห้ามให้ userId มาจาก client input โดยตรงเด็ดขาด
export async function getMyWeeklyRank(supabase: SupabaseServerClient, userId: string): Promise<MyWeeklyRank> {
  const { data, error } = await supabase.rpc("get_my_weekly_rank", { p_user_id: userId });
  if (error) throw new Error("ดึงอันดับสัปดาห์นี้ไม่สำเร็จ: " + error.message);

  const row = (data as
    | {
        in_top5: boolean;
        my_rank: number;
        total_players: number;
        band: "top" | "mid" | "start";
        points: number;
        points_to_next: number | null;
      }[]
    | null)?.[0];

  if (!row) return { hasRank: false };

  return {
    hasRank: true,
    inTop5: row.in_top5,
    myRank: row.my_rank,
    totalPlayers: row.total_players,
    band: row.band,
    points: row.points,
    pointsToNext: row.points_to_next,
  };
}

export async function getWeeklyLeaderboard(supabase: SupabaseServerClient): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_weekly_leaderboard");
  if (error) throw new Error("ดึง leaderboard ไม่สำเร็จ: " + error.message);
  return (data ?? []) as LeaderboardEntry[];
}
