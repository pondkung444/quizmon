import "server-only";
import { createClient, getUser } from "@/lib/supabase/server";
import { type Subline, type Personality } from "@/lib/evolution";
import { getSpeciesName } from "@/lib/petLine";
import { getPetImagePath } from "@/lib/petImage";
type EggTypeJoin = { sprite_prefix: string; name_th: string };

function pickEggType(joined: EggTypeJoin | EggTypeJoin[] | null): EggTypeJoin | null {
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

// หน้าฟาร์ม — Qmon ทุกตัวที่เลี้ยงจนโตเต็มที่และเก็บเข้าฟาร์มแล้ว (ตัวซ้ำคอมโบเดียวกันโชว์ครบทุกตัว
// ไม่ dedupe แบบ /collection/album ที่โชว์แค่ตัวแรกต่อคอมโบเป็นสมุดสะสม — ฟาร์มคือ "ตัวจริงทุกตัวที่มี")
export async function loadFarmPets() {
  const supabase = await createClient();
  const user = await getUser();

  const pets: {
    id: string;
    nickname: string | null;
    imagePath: string;
    speciesName: string;
  }[] = [];

  if (user) {
    const { data: petRows } = await supabase
      .from("pets")
      .select("id, nickname, subline, personality, evolved_at, egg_types(sprite_prefix, name_th)")
      .eq("user_id", user.id)
      .eq("stage", 4)
      .eq("is_active", false)
      .order("evolved_at", { ascending: false });

    for (const row of petRows ?? []) {
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
        console.error("CollectionFarmPage: skip pet with bad data", row.id, err);
      }
    }
  }

  return pets;
}

