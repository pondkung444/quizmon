import type { createClient } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const DUNGEON_PITY_GOAL = 14;

export type DungeonInfo = {
  id: string;
  nameTh: string;
  backgroundPath: string;
  durationMinutes: number;
  rewardTier: string;
};

export type DungeonRunDetail = {
  id: string;
  startedAt: string;
  endsAt: string;
  bonusQuizUsed: boolean;
  bonusMinutesSaved: number;
  petImagePath: string;
  petSpeciesName: string;
};

export type DungeonCardState =
  | { status: "invite" }
  | { status: "ready" }
  | { status: "traveling"; dungeon: DungeonInfo; run: DungeonRunDetail }
  | { status: "claimable"; dungeon: DungeonInfo; run: DungeonRunDetail };

export type EligiblePet = {
  id: string;
  imagePath: string;
  speciesName: string;
};

type EggTypeJoin = { sprite_prefix: string; name_th: string };

function pickEggType(
  joined: EggTypeJoin | EggTypeJoin[] | null
): EggTypeJoin | null {
  return Array.isArray(joined) ? (joined[0] ?? null) : joined;
}

function mapDungeonRow(row: {
  id: string;
  name_th: string;
  background_path: string;
  duration_minutes: number;
  reward_tier: string;
}): DungeonInfo {
  return {
    id: row.id,
    nameTh: row.name_th,
    backgroundPath: row.background_path,
    durationMinutes: row.duration_minutes,
    rewardTier: row.reward_tier,
  };
}

// ดันเจี้ยนที่เปิดใช้งานอยู่ — v1 มีแถวเดียว (cave_frost) แต่คิวรีแบบเผื่ออนาคตมีหลายแถว
// (sort_order) ไม่ hardcode slug ตรงๆ
export async function getActiveDungeon(supabase: SupabaseServerClient): Promise<DungeonInfo | null> {
  const { data } = await supabase
    .from("dungeon_types")
    .select("id, name_th, background_path, duration_minutes, reward_tier")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? mapDungeonRow(data) : null;
}

// มิเตอร์การันตีไข่ — ไม่มีแถว = ยังไม่เคยเคลมดันเจี้ยน tier นี้เลย ถือเป็น 0 (ไม่ error)
export async function getPityMeter(
  supabase: SupabaseServerClient,
  userId: string,
  rewardTier: string
): Promise<number> {
  const { data } = await supabase
    .from("dungeon_pity")
    .select("meter")
    .eq("user_id", userId)
    .eq("reward_tier", rewardTier)
    .maybeSingle();

  return data?.meter ?? 0;
}

// pet ที่ส่งผจญภัยได้ — โตเต็มที่ (stage 4) และเก็บเข้าสมุดแล้ว (is_active=false) เรียงตัวที่ฟักล่าสุดก่อน
export async function getEligiblePets(
  supabase: SupabaseServerClient,
  userId: string
): Promise<EligiblePet[]> {
  const { data } = await supabase
    .from("pets")
    .select("id, hatched_at, subline, personality, egg_types(sprite_prefix, name_th)")
    .eq("user_id", userId)
    .eq("stage", 4)
    .eq("is_active", false)
    .order("hatched_at", { ascending: false });

  const pets: EligiblePet[] = [];
  for (const row of data ?? []) {
    const eggType = pickEggType(row.egg_types as EggTypeJoin | EggTypeJoin[] | null);
    if (!eggType || !row.subline || !row.personality) continue;
    try {
      pets.push({
        id: row.id,
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
      console.error("getEligiblePets: skip pet with bad data", row.id, err);
    }
  }
  return pets;
}

type RunRow = {
  id: string;
  started_at: string;
  ends_at: string;
  bonus_quiz_used: boolean;
  bonus_minutes_saved: number;
  dungeon_types: {
    id: string;
    name_th: string;
    background_path: string;
    duration_minutes: number;
    reward_tier: string;
  } | { id: string; name_th: string; background_path: string; duration_minutes: number; reward_tier: string }[] | null;
  pets: {
    subline: string | null;
    personality: string | null;
    egg_types: EggTypeJoin | EggTypeJoin[] | null;
  } | {
    subline: string | null;
    personality: string | null;
    egg_types: EggTypeJoin | EggTypeJoin[] | null;
  }[] | null;
};

// รันที่กำลังเดินทาง/รอเคลมอยู่ตอนนี้ของ user (status='in_progress' เสมอจนกว่าจะเคลม — ต้องเทียบ
// ends_at กับ now() เองฝั่ง caller เพื่อแยก "กำลังเดินทาง" กับ "รอเคลม")
export async function getOwnActiveRun(
  supabase: SupabaseServerClient,
  userId: string
): Promise<{ dungeon: DungeonInfo; run: DungeonRunDetail } | null> {
  const { data } = await supabase
    .from("dungeon_runs")
    .select(
      "id, started_at, ends_at, bonus_quiz_used, bonus_minutes_saved, dungeon_types(id, name_th, background_path, duration_minutes, reward_tier), pets(subline, personality, egg_types(sprite_prefix, name_th))"
    )
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle<RunRow>();

  if (!data) return null;

  const dungeonRow = Array.isArray(data.dungeon_types) ? data.dungeon_types[0] : data.dungeon_types;
  const petRow = Array.isArray(data.pets) ? data.pets[0] : data.pets;
  if (!dungeonRow || !petRow) return null;

  const eggType = pickEggType(petRow.egg_types);
  if (!eggType || !petRow.subline || !petRow.personality) return null;

  const petImagePath = getPetImagePath(
    eggType.sprite_prefix,
    4,
    petRow.subline as Subline,
    petRow.personality as Personality
  );
  const petSpeciesName = getSpeciesName(
    eggType.sprite_prefix,
    4,
    petRow.subline as Subline,
    petRow.personality as Personality,
    eggType.name_th
  );

  return {
    dungeon: mapDungeonRow(dungeonRow),
    run: {
      id: data.id,
      startedAt: data.started_at,
      endsAt: data.ends_at,
      bonusQuizUsed: data.bonus_quiz_used,
      bonusMinutesSaved: data.bonus_minutes_saved,
      petImagePath,
      petSpeciesName,
    },
  };
}

// สถานะสำหรับการ์ดใน /pet — เบากว่า getOwnActiveRun/getEligiblePets รวมกัน (ไม่ต้องดึงลิสต์ pet
// เต็มถ้าไม่มีรันค้าง แค่เช็คว่ามีอย่างน้อย 1 ตัวพอ)
export async function getDungeonCardState(
  supabase: SupabaseServerClient,
  userId: string
): Promise<DungeonCardState> {
  const activeRun = await getOwnActiveRun(supabase, userId);
  if (activeRun) {
    const isClaimable = new Date(activeRun.run.endsAt).getTime() <= Date.now();
    return { status: isClaimable ? "claimable" : "traveling", ...activeRun };
  }

  const { count } = await supabase
    .from("pets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("stage", 4)
    .eq("is_active", false);

  return count && count > 0 ? { status: "ready" } : { status: "invite" };
}

export type DungeonEntryState =
  | { status: "ready" }
  | { status: "own_traveling" }
  | { status: "own_claimable" }
  | { status: "blocked_other_pet"; otherPetName: string };

// สถานะปุ่ม "ส่งไปผจญภัย" สำหรับ Qmon ตัวหนึ่งโดยเฉพาะ (ใช้ใน /collection/[petId]) — concurrency
// เป็นต่อ user ไม่ใช่ต่อ Qmon จึงต้องแยกให้ชัดว่ารันที่ค้างอยู่ (ถ้ามี) เป็นของตัวนี้เอง (own_*)
// หรือของตัวอื่น (blocked_other_pet) ไม่แตะ getOwnActiveRun/getDungeonCardState เดิมเลย เรียกใช้
// ผ่านฟังก์ชันเดิมแล้วเสริมด้วย query pet_id เบาๆ อีกครั้งเท่านั้น
export async function getDungeonEntryState(
  supabase: SupabaseServerClient,
  userId: string,
  petId: string
): Promise<DungeonEntryState> {
  const activeRun = await getOwnActiveRun(supabase, userId);
  if (!activeRun) return { status: "ready" };

  const { data: runRow } = await supabase
    .from("dungeon_runs")
    .select("pet_id")
    .eq("id", activeRun.run.id)
    .maybeSingle();

  if (runRow?.pet_id === petId) {
    const isClaimable = new Date(activeRun.run.endsAt).getTime() <= Date.now();
    return { status: isClaimable ? "own_claimable" : "own_traveling" };
  }

  // ชื่อที่โชว์: nickname ก่อนเสมอ (nullable) fallback เป็นชื่อพันธุ์ที่ getOwnActiveRun คำนวณไว้แล้ว
  let otherPetName = activeRun.run.petSpeciesName;
  if (runRow?.pet_id) {
    const { data: otherPet } = await supabase
      .from("pets")
      .select("nickname")
      .eq("id", runRow.pet_id)
      .maybeSingle();
    if (otherPet?.nickname) otherPetName = otherPet.nickname;
  }

  return { status: "blocked_other_pet", otherPetName };
}
