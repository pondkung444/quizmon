import { createAdminClient } from "@/lib/supabase/admin";
import { getPetImagePath } from "@/lib/petImage";
import type { Subline, Personality } from "@/lib/evolution";

type AdminClient = ReturnType<typeof createAdminClient>;

type EggTypeJoin = { sprite_prefix: string; name_th: string };
function pickOne<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/**
 * ดึง "Qmon ที่ภูมิใจ" ของ user มาใช้เป็นภาพประกอบ push — ตาม
 * QuizMon-Push-Notification-Design.md §11 ตาราง event push: ทุก event ที่เกี่ยวกับเพื่อน/
 * กำลังใจใช้ "Qmon ที่แสดงบนโปรไฟล์" ของผู้พูดเป็นภาพ ไม่ใช่ของผู้รับ
 * ถ้ายังไม่ได้ตั้ง pride pet ให้ fallback ไปใช้ Qmon ตัวที่กำลังเลี้ยงอยู่ (is_active=true)
 * ตามกติกาเดียวกับที่ resolvePetDisplay ใช้ในหน้าโปรไฟล์ (src/components/social/petSummary.ts)
 * คืน null ถ้าหาไม่เจอเลย (ปล่อยให้ push แสดงแค่ข้อความ+ไอคอน QuizMon ตามปกติ)
 */
export async function getShowcasePetImageUrl(
  admin: AdminClient,
  userId: string
): Promise<string | null> {
  const { data: settings } = await admin
    .from("profile_settings")
    .select("pride_pet_id")
    .eq("user_id", userId)
    .maybeSingle();

  let petId = settings?.pride_pet_id as string | null | undefined;

  if (!petId) {
    const { data: activePet } = await admin
      .from("pets")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    petId = activePet?.id as string | undefined;
  }
  if (!petId) return null;

  const { data: pet } = await admin
    .from("pets")
    .select("stage, subline, personality, egg_types(sprite_prefix, name_th)")
    .eq("id", petId)
    .maybeSingle();
  if (!pet) return null;

  const eggType = pickOne(pet.egg_types as EggTypeJoin | EggTypeJoin[] | null);
  if (!eggType) return null;

  try {
    const path = getPetImagePath(
      eggType.sprite_prefix,
      pet.stage as number,
      (pet.subline ?? null) as Subline | null,
      (pet.personality ?? null) as Personality | null
    );
    return `https://quizmon.xyz${path}`;
  } catch {
    // ข้อมูลยังไม่ครบพอคำนวณภาพ (เช่น stage3 แต่ subline ยัง sync ไม่ทัน) — ไม่ error ทั้ง push
    return null;
  }
}
