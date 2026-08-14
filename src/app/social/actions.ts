"use server";

import { createClient, getUser } from "@/lib/supabase/server";

export async function setPrideQmon(petId: string): Promise<{ pridePetId: string; favoritePetIds: string[] }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");

  const supabase = await createClient();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, is_active, stage")
    .eq("id", petId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pet || !(pet.is_active || pet.stage === 4)) {
    throw new Error("เลือก Qmon ตัวนี้เป็นตัวที่ภูมิใจไม่ได้");
  }

  const { data: settings } = await supabase
    .from("profile_settings")
    .select("favorite_pet_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  // ถ้าตัวที่เพิ่งเลือกเป็น Qmon ที่ภูมิใจซ้ำกับที่อยู่ใน favorite อยู่แล้ว ต้องตัดออกจาก favorite
  // แบบเงียบๆ (ไม่ error ไม่เด้งเตือน) — กันกติกา "ไม่ซ้ำกัน" โดยไม่ลงโทษผู้เล่น
  const favoritePetIds = (settings?.favorite_pet_ids ?? []).filter((id: string) => id !== petId);

  const { error } = await supabase.from("profile_settings").upsert(
    {
      user_id: user.id,
      pride_pet_id: petId,
      favorite_pet_ids: favoritePetIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error("บันทึก Qmon ที่ภูมิใจไม่สำเร็จ: " + error.message);

  return { pridePetId: petId, favoritePetIds };
}

export async function setFavoriteQmon(petIds: string[]): Promise<{ favoritePetIds: string[] }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");
  if (petIds.length > 3) throw new Error("เลือก Qmon ตัวโปรดได้สูงสุด 3 ตัว");

  const supabase = await createClient();

  if (petIds.length > 0) {
    // DB constraint เช็คแค่ความยาว array ไม่เช็ค ownership/stage — ต้อง validate เองตรงนี้
    const { data: pets } = await supabase
      .from("pets")
      .select("id")
      .eq("user_id", user.id)
      .eq("stage", 4)
      .in("id", petIds);

    if ((pets?.length ?? 0) !== petIds.length) {
      throw new Error("มี Qmon ที่เลือกไม่ใช่ตัวที่โตเต็มที่แล้ว หรือไม่ใช่ของบัญชีนี้");
    }
  }

  const { error } = await supabase.from("profile_settings").upsert(
    { user_id: user.id, favorite_pet_ids: petIds, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) throw new Error("บันทึก Qmon ตัวโปรดไม่สำเร็จ: " + error.message);

  return { favoritePetIds: petIds };
}

export async function setPinnedMedals(achievementIds: string[]): Promise<{ pinnedAchievementIds: string[] }> {
  const user = await getUser();
  if (!user) throw new Error("ไม่พบผู้ใช้");
  if (achievementIds.length > 3) throw new Error("ปักหมุดเหรียญได้สูงสุด 3 เหรียญ");

  const supabase = await createClient();

  if (achievementIds.length > 0) {
    const { data: earned } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", user.id)
      .in("achievement_id", achievementIds);

    if ((earned?.length ?? 0) !== achievementIds.length) {
      throw new Error("ปักหมุดได้เฉพาะเหรียญที่ปลดล็อกแล้วเท่านั้น");
    }
  }

  const { error: deleteError } = await supabase
    .from("user_pinned_achievements")
    .delete()
    .eq("user_id", user.id);
  if (deleteError) throw new Error("บันทึกเหรียญที่ปักหมุดไม่สำเร็จ: " + deleteError.message);

  if (achievementIds.length > 0) {
    const { error: insertError } = await supabase.from("user_pinned_achievements").insert(
      achievementIds.map((achievementId, index) => ({
        user_id: user.id,
        achievement_id: achievementId,
        pin_order: index + 1,
      }))
    );
    if (insertError) throw new Error("บันทึกเหรียญที่ปักหมุดไม่สำเร็จ: " + insertError.message);
  }

  return { pinnedAchievementIds: achievementIds };
}
