import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type FoodInventory = { A: number; B: number };

// อ่านคลังอาหาร A/B ของ user คนนี้ — player_food มีแค่ select-own policy (เขียนได้ทาง RPC feed_pet/
// claim_daily_mission_bonus เท่านั้น) ต้องใช้ user-session client ไม่ใช่ admin ถึงจะผ่าน RLS อาจไม่มี
// แถวเลยถ้ายังไม่เคยได้อาหารชนิดนั้น (0 ทั้งคู่ ไม่ error) — ไม่ใช่ 0 rows แปลว่า RLS พังเสมอ
export async function getPlayerFoodInventory(
  supabase: SupabaseServerClient,
  userId: string
): Promise<FoodInventory> {
  const { data } = await supabase.from("player_food").select("food_type, quantity").eq("user_id", userId);

  const inventory: FoodInventory = { A: 0, B: 0 };
  for (const row of data ?? []) {
    const foodType = row.food_type as string;
    if (foodType === "A" || foodType === "B") {
      inventory[foodType] = row.quantity;
    }
  }
  return inventory;
}
