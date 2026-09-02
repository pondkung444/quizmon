import type { createClient } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type BossRaidSelectablePet = {
  id: string;
  imagePath: string;
  speciesName: string;
  nickname: string | null;
};

type EggTypeJoin = { sprite_prefix: string; name_th: string };

function pickEggType(joined: EggTypeJoin | EggTypeJoin[] | null): EggTypeJoin | null {
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

// Qmon ที่เลือกลง boss raid ได้ — โตเต็มวัย (stage 4) มี stat/gear คำนวณเต็มแล้ว
// ต่างจาก /adventure ตรงที่ต้องรวมตัว is_active=true ด้วย (ไม่กรอง is_active) เรียงตัวที่ฟักล่าสุดก่อน
export async function getBossRaidSelectablePets(
  supabase: SupabaseServerClient,
  userId: string
): Promise<BossRaidSelectablePet[]> {
  const { data } = await supabase
    .from("pets")
    .select("id, nickname, hatched_at, subline, personality, egg_types(sprite_prefix, name_th)")
    .eq("user_id", userId)
    .eq("stage", 4)
    .order("hatched_at", { ascending: false });

  const pets: BossRaidSelectablePet[] = [];
  for (const row of data ?? []) {
    const eggType = pickEggType(row.egg_types as EggTypeJoin | EggTypeJoin[] | null);
    if (!eggType || !row.subline || !row.personality) continue;
    try {
      pets.push({
        id: row.id,
        nickname: row.nickname,
        imagePath: getPetImagePath(
          eggType.sprite_prefix,
          4,
          row.subline as Subline,
          row.personality as Personality
        ),
        speciesName: getSpeciesName(
          eggType.sprite_prefix,
          4,
          row.subline as Subline,
          row.personality as Personality,
          eggType.name_th
        ),
      });
    } catch (err) {
      console.error("getBossRaidSelectablePets: skip pet with bad data", row.id, err);
    }
  }
  return pets;
}
