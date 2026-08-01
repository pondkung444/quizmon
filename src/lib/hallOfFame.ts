import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HallOfFameWinner = {
  userId: string;
  username: string;
  totalPoints: number;
  accuracy: number;
  claimed: boolean;
};

export type HallOfFameWeek = {
  weekStartDate: string;
  junior: HallOfFameWinner[];
  senior: HallOfFameWinner[];
};

export type HallOfFamePage = {
  weeks: HallOfFameWeek[];
  hasMore: boolean;
};

type RpcRow = {
  week_start_date: string;
  grade_band: "junior" | "senior";
  user_id: string;
  username: string;
  total_points: number;
  accuracy: number;
  claimed: boolean;
};

const WEEKS_PER_PAGE = 10;

// ต้องมี user session ก่อนเสมอ (pattern เดียวกับ getWeeklyLeaderboard/getMyWeeklyRank) — ฟังก์ชันนี้
// ไม่เช็ค auth.getUser() ซ้ำเอง ให้ caller (page/action) เช็คก่อนเรียกเสมอ
//
// weeksOffset นับเฉพาะ "สัปดาห์ที่มีคนเล่นจริง" ที่เคยโชว์ไปแล้ว (ไม่ใช่จำนวนหน้า) — ต้องส่ง
// จำนวนสัปดาห์สะสมที่แสดงอยู่แล้วทุกครั้งที่กด "โหลดเพิ่ม" (ดู HallOfFameList.tsx)
//
// ขอ weeksLimit+1 แถวสัปดาห์จริงจาก RPC (เกินจากที่จะโชว์ 1 สัปดาห์) เพื่อรู้ hasMore โดยไม่ต้องยิง
// query รอบสอง — ถ้าได้ครบ weeksLimit+1 สัปดาห์ = ตัดสัปดาห์สุดท้ายทิ้งแล้วบอก hasMore:true
export async function getHallOfFamePage(
  supabase: SupabaseServerClient,
  weeksOffset: number,
  weeksLimit: number = WEEKS_PER_PAGE
): Promise<HallOfFamePage> {
  const { data, error } = await supabase.rpc("get_hall_of_fame_page", {
    p_weeks_offset: weeksOffset,
    p_weeks_limit: weeksLimit + 1,
  });
  if (error) throw new Error("ดึงข้อมูล Hall of Fame ไม่สำเร็จ: " + error.message);

  const rows = (data ?? []) as RpcRow[];

  const byWeek = new Map<string, HallOfFameWeek>();
  const weekOrder: string[] = [];
  for (const row of rows) {
    let week = byWeek.get(row.week_start_date);
    if (!week) {
      week = { weekStartDate: row.week_start_date, junior: [], senior: [] };
      byWeek.set(row.week_start_date, week);
      weekOrder.push(row.week_start_date);
    }
    week[row.grade_band].push({
      userId: row.user_id,
      username: row.username,
      totalPoints: row.total_points,
      accuracy: row.accuracy,
      claimed: row.claimed,
    });
  }

  const allWeeks = weekOrder.map((d) => byWeek.get(d)!);
  const hasMore = allWeeks.length > weeksLimit;
  return { weeks: allWeeks.slice(0, weeksLimit), hasMore };
}
