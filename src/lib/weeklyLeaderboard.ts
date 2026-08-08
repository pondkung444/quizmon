import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GradeBand } from "@/lib/gradeBand";

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
      username: string;
    };

// ต้องรับ userId จาก caller ที่ดึงจาก session (server component/action) เท่านั้น — ฟังก์ชันนี้ไม่ auth.getUser()
// ซ้ำเอง และ RPC เองก็รับ p_user_id ตรงๆ ไม่เช็คว่าตรงกับ auth.uid() ของผู้เรียกหรือเปล่า (ดู migration
// get_my_weekly_rank) ดังนั้นห้ามให้ userId มาจาก client input โดยตรงเด็ดขาด
//
// gradeBand เป็น required (ไม่ใช่ optional) เพราะเรียก RPC overload get_my_weekly_rank(p_user_id,
// p_grade_band) ที่ไม่มี default — ต้องรู้ band ของผู้เรียกเสมอ (ดึงผ่าน getGradeBand() จาก
// src/lib/gradeBand.ts) ก่อน filter pool ให้ rank()/percentile คำนวณบน pool ที่กรองแล้วเท่านั้น
export async function getMyWeeklyRank(
  supabase: SupabaseServerClient,
  userId: string,
  gradeBand: GradeBand
): Promise<MyWeeklyRank> {
  const { data, error } = await supabase.rpc("get_my_weekly_rank", {
    p_user_id: userId,
    p_grade_band: gradeBand,
  });
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

  // ต้องใช้ admin client อ่าน profiles.username เสมอ ไม่ใช่ user-session client (RLS ของ profiles
  // เคยทำให้ query จาก client ปกติเงียบๆ คืน null แทน error — เหตุผลเดียวกับ getGradeBand() ใน
  // src/lib/gradeBand.ts) ใช้แสดงชื่อตัวเองในแถว "ไม่ติด Top 5" ของ WeeklyLeaderboardCard.tsx เท่านั้น
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("username").eq("id", userId).single();

  return {
    hasRank: true,
    inTop5: row.in_top5,
    myRank: row.my_rank,
    totalPlayers: row.total_players,
    band: row.band,
    points: row.points,
    pointsToNext: row.points_to_next,
    username: profile?.username ?? "คุณ",
  };
}

// gradeBand เป็น optional ตั้งใจ (ต่างจาก getMyWeeklyRank) — ไม่ส่ง/ส่ง undefined = p_grade_band
// null เข้า RPC ซึ่ง default อยู่แล้วที่ null (ไม่กรอง ทุก band) rollout-safe กับ caller เดิม
export async function getWeeklyLeaderboard(
  supabase: SupabaseServerClient,
  gradeBand?: GradeBand
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_weekly_leaderboard", {
    p_grade_band: gradeBand ?? null,
  });
  if (error) throw new Error("ดึง leaderboard ไม่สำเร็จ: " + error.message);
  return (data ?? []) as LeaderboardEntry[];
}

// สำหรับ /admin/analytics เท่านั้น — get_weekly_leaderboard() (ด้านบน) hardcode limit 5 ไว้สำหรับการ์ด
// ผู้เล่นที่ /pet โดยเฉพาะ (ไม่ต้องแก้ RPC/migration) เรียก weekly_scores_bkk() ตรงๆ แทน (ตัวเดียวกับที่
// get_weekly_leaderboard() ห่ออยู่ ให้ทุกคนที่มี rank ทั้งหมด) แล้ว rank/slice เอาเองฝั่งนี้ — จำลอง
// rank() over (order by total_points desc, accuracy desc) ให้ตรงกับที่ RPC ทำ (คนแต้ม+accuracy เท่ากัน
// ได้อันดับเดียวกัน อันดับถัดไปข้ามเลข ตาม standard competition ranking)
//
// gradeBand optional เหมือน getWeeklyLeaderboard — undefined = p_grade_band null (ทุก band)
//
// userIdFilter (เพิ่มโดย admin analytics school filter): weekly_scores_bkk() คืน user_id มาด้วยจริง
// (ดู migration 20260727082823) เดิมจงใจไม่ cast ผ่านมาเพราะไม่มี caller ต้องใช้ ตอนนี้ต้องใช้กรอง
// ตาม school ก่อนคำนวณ rank (ต้อง filter ก่อน sort/rank เสมอ ไม่ใช่กรองผลลัพธ์ที่ rank ไปแล้ว
// ไม่งั้นเลขอันดับจะไม่ตรงกับ pool ที่กรอง)
export async function getWeeklyLeaderboardTopN(
  supabase: SupabaseServerClient,
  limit: number,
  gradeBand?: GradeBand,
  userIdFilter?: Set<string> | null
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("weekly_scores_bkk", {
    p_grade_band: gradeBand ?? null,
  });
  if (error) throw new Error("ดึง weekly leaderboard ไม่สำเร็จ: " + error.message);

  const rows = (data ?? []) as { user_id: string; username: string; total_points: number; accuracy: number }[];
  const filteredRows = userIdFilter ? rows.filter((r) => userIdFilter.has(r.user_id)) : rows;
  const sorted = [...filteredRows].sort((a, b) => b.total_points - a.total_points || b.accuracy - a.accuracy);

  const ranked: LeaderboardEntry[] = [];
  let rank = 0;
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    if (i === 0 || row.total_points !== prev.total_points || row.accuracy !== prev.accuracy) {
      rank = i + 1;
    }
    ranked.push({ rnk: rank, username: row.username, total_points: row.total_points, accuracy: row.accuracy });
  });

  return ranked.slice(0, limit);
}
