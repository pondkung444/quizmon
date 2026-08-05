import type { createClient } from "@/lib/supabase/server";
import type { Personality } from "@/lib/evolution";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName, parsePetLine } from "@/lib/petLine";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type HallOfFamePet = {
  imagePath: string;
  speciesName: string;
};

export type HallOfFameWinner = {
  userId: string;
  username: string;
  totalPoints: number;
  accuracy: number;
  claimed: boolean;
  pet: HallOfFamePet | null;
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

export type CurrentWeekLeader = {
  userId: string;
  username: string;
  totalPoints: number;
  accuracy: number;
  pet: HallOfFamePet | null;
};

export type CurrentWeekLeaders = {
  weekEnd: string | null;
  junior: CurrentWeekLeader[];
  senior: CurrentWeekLeader[];
};

type EggTypeInfo = { spritePrefix: string; nameTh: string };

function isPersonality(v: string): v is Personality {
  return v === "A" || v === "B";
}

// สร้างรูป+ชื่อพันธุ์จาก pet stage 4 ตัวล่าสุดที่ RPC join มาให้แล้ว (ดู get_hall_of_fame_page /
// get_current_week_leaders) — คืน null เงียบๆ ถ้าข้อมูลไม่ครบ (ไม่มี pet stage 4 เลย หรือ egg
// type ไม่รู้จัก) ไม่ throw เพราะแถวยังต้องแสดงได้ปกติแค่ไม่มีรูป (ดูโจทย์ข้อ 5.1)
function resolvePet(
  eggTypeId: string | null,
  subline: string | null,
  personality: string | null,
  eggTypes: Map<string, EggTypeInfo>
): HallOfFamePet | null {
  if (!eggTypeId || !subline || !personality || !isPersonality(personality)) return null;
  const eggType = eggTypes.get(eggTypeId);
  if (!eggType) return null;
  const line = parsePetLine(subline);
  if (!line) return null;
  return {
    imagePath: getPetImagePath(eggType.spritePrefix, 4, line, personality),
    speciesName: getSpeciesName(eggType.spritePrefix, 4, line, personality, eggType.nameTh),
  };
}

async function fetchEggTypes(supabase: SupabaseServerClient): Promise<Map<string, EggTypeInfo>> {
  const { data } = await supabase.from("egg_types").select("id, sprite_prefix, name_th");
  const map = new Map<string, EggTypeInfo>();
  for (const row of data ?? []) {
    map.set(row.id, { spritePrefix: row.sprite_prefix, nameTh: row.name_th });
  }
  return map;
}

type RpcRow = {
  week_start_date: string;
  grade_band: "junior" | "senior";
  user_id: string;
  username: string;
  total_points: number;
  accuracy: number;
  claimed: boolean;
  pet_egg_type_id: string | null;
  pet_subline: string | null;
  pet_personality: string | null;
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
  const [{ data, error }, eggTypes] = await Promise.all([
    supabase.rpc("get_hall_of_fame_page", {
      p_weeks_offset: weeksOffset,
      p_weeks_limit: weeksLimit + 1,
    }),
    fetchEggTypes(supabase),
  ]);
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
      pet: resolvePet(row.pet_egg_type_id, row.pet_subline, row.pet_personality, eggTypes),
    });
  }

  const allWeeks = weekOrder.map((d) => byWeek.get(d)!);
  const hasMore = allWeeks.length > weeksLimit;
  return { weeks: allWeeks.slice(0, weeksLimit), hasMore };
}

type CurrentWeekRpcRow = {
  week_start: string;
  week_end: string;
  grade_band: "junior" | "senior";
  user_id: string;
  username: string;
  total_points: number;
  accuracy: number;
  pet_egg_type_id: string | null;
  pet_subline: string | null;
  pet_personality: string | null;
};

// สัปดาห์ที่กำลังแข่งอยู่ตอนนี้ (ยังไม่ตัดสิน) — คนละ RPC กับ get_hall_of_fame_page เพราะสัปดาห์นี้
// ยังไม่ปิด weekly_leaderboard_rewards เลยยังไม่มี "claimed" ให้เช็ค band ไหนยังไม่มีใครทำคะแนน
// จะไม่มีแถวคืนมาจาก RPC เลย (ไม่ใช่ null row) — junior/senior ในผลลัพธ์นี้เลยมี 0 หรือ 1 แถวเท่านั้น
export async function getCurrentWeekLeaders(supabase: SupabaseServerClient): Promise<CurrentWeekLeaders> {
  const [{ data, error }, eggTypes] = await Promise.all([
    supabase.rpc("get_current_week_leaders"),
    fetchEggTypes(supabase),
  ]);
  if (error) throw new Error("ดึงข้อมูลสัปดาห์นี้ไม่สำเร็จ: " + error.message);

  const rows = (data ?? []) as CurrentWeekRpcRow[];

  const result: CurrentWeekLeaders = { weekEnd: null, junior: [], senior: [] };
  for (const row of rows) {
    result.weekEnd = row.week_end;
    result[row.grade_band].push({
      userId: row.user_id,
      username: row.username,
      totalPoints: row.total_points,
      accuracy: row.accuracy,
      pet: resolvePet(row.pet_egg_type_id, row.pet_subline, row.pet_personality, eggTypes),
    });
  }
  return result;
}
