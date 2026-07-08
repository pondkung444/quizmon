"use server";

import { createClient } from "@/lib/supabase/server";

export async function collectPet(): Promise<{ collected: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  // 1) หา active pet ต้องเป็น stage 4 เท่านั้นถึงเก็บได้
  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("id, stage")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (petError || !pet) throw new Error("ไม่พบ Qmon ที่กำลังเลี้ยงอยู่");
  if (pet.stage !== 4) throw new Error("Qmon ตัวนี้ยังโตไม่เต็มที่ เก็บเข้าสมุดไม่ได้");

  // 2) เก็บเข้าสมุด (is_active = false)
  const { error: collectError } = await supabase
    .from("pets")
    .update({ is_active: false })
    .eq("id", pet.id);

  if (collectError) throw new Error("เก็บ Qmon เข้าสมุดไม่สำเร็จ: " + collectError.message);

  // 3) เช็คว่าเคยได้ไข่ใบสอง (egg_common_02) มาก่อนหรือยัง ถ้ายัง -> ปลดล็อกให้
  const { data: existingSecondEgg } = await supabase
    .from("player_eggs")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "first_pet_reward")
    .maybeSingle();

  if (!existingSecondEgg) {
    const { error: rewardError } = await supabase.from("player_eggs").insert({
      user_id: user.id,
      egg_type_id: "egg_common_02",
      source: "first_pet_reward",
    });
    if (rewardError) throw new Error("ปลดล็อกไข่ใบสองไม่สำเร็จ: " + rewardError.message);
  }

  return { collected: true };
}
