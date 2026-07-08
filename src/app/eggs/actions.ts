"use server";

import { createClient } from "@/lib/supabase/server";

export async function hatchEgg(playerEggId: string): Promise<{ petId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  // 1) เช็คว่ามี pet active อยู่แล้วหรือไม่ (กันฟักซ้อน — DB unique index เป็น backstop ชั้นสอง)
  const { data: activePet } = await supabase
    .from("pets")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (activePet) {
    throw new Error("มี Qmon ที่กำลังเลี้ยงอยู่แล้ว ต้องเก็บเข้าสมุดก่อนถึงจะฟักตัวใหม่ได้");
  }

  // 2) เช็คว่าไข่ใบนี้เป็นของ user นี้จริง และยังไม่ฟัก
  const { data: egg, error: eggError } = await supabase
    .from("player_eggs")
    .select("id, egg_type_id, hatched_at")
    .eq("id", playerEggId)
    .eq("user_id", user.id)
    .single();

  if (eggError || !egg) throw new Error("ไม่พบไข่ใบนี้ในคลังของคุณ");
  if (egg.hatched_at) throw new Error("ไข่ใบนี้ฟักไปแล้ว");

  // 3) สร้าง pet ใหม่
  const { data: newPet, error: petError } = await supabase
    .from("pets")
    .insert({
      user_id: user.id,
      egg_type_id: egg.egg_type_id,
      stage: 1,
      exp: 0,
      math_correct: 0,
      science_correct: 0,
      is_active: true,
    })
    .select("id")
    .single();

  if (petError || !newPet) throw new Error("สร้าง Qmon ใหม่ไม่สำเร็จ: " + petError?.message);

  // 4) mark ไข่ว่าฟักแล้ว
  const { error: updateError } = await supabase
    .from("player_eggs")
    .update({ hatched_at: new Date().toISOString(), hatched_pet_id: newPet.id })
    .eq("id", egg.id);

  if (updateError) throw new Error("อัปเดตสถานะไข่ไม่สำเร็จ: " + updateError.message);

  return { petId: newPet.id };
}
