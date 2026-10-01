import { createClient } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { artLane, getSpeciesName, parsePetLine } from "@/lib/petLine";
import type { Personality } from "@/lib/evolution";
import { forestConfig, readForestStats, type ForestStats, type PetStats } from "./stats";

type ForestPet = PetStats & {
  id: string; nickname: string | null; subline: string | null;
  personality: string | null; is_active: boolean;
  egg_types: { name_th: string; sprite_prefix: string; stat_profile: { caps: ForestStats } };
};

export const FOREST_PET_SELECT = "id,nickname,stage,subline,personality,is_active,stat_hp,stat_atk,stat_def,stat_spd,stat_foc,egg_types(name_th,sprite_prefix,stat_profile)";

export async function ownedForestPets(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, petId?: string) {
  let query = supabase.from("pets").select(FOREST_PET_SELECT).eq("user_id", userId)
    .order("is_active", { ascending: false }).order("created_at", { ascending: false });
  if (petId) query = query.eq("id", petId);
  const { data, error } = await query;
  if (error) throw new Error("โหลดคู่หูไม่สำเร็จ กรุณาลองใหม่");
  return (data ?? []) as unknown as ForestPet[];
}

export function forestCompanion(pet: ForestPet) {
  const line = parsePetLine(pet.subline);
  const personality = pet.personality === "A" || pet.personality === "B" ? pet.personality as Personality : null;
  const egg = pet.egg_types;
  if (!egg?.sprite_prefix) throw new Error("ข้อมูลภาพคู่หูยังไม่ครบ");
  if (pet.stage >= 3 && !line) throw new Error("ข้อมูลสายของคู่หูยังไม่ครบ");
  const stats = readForestStats(pet, egg.stat_profile?.caps ?? {} as ForestStats);
  return {
    id: pet.id,
    name: pet.nickname || getSpeciesName(egg.sprite_prefix, pet.stage, line, personality, egg.name_th),
    stage: pet.stage,
    eggPrefix: egg.sprite_prefix,
    isActive: pet.is_active,
    lane: line ? artLane(line) : "balanced",
    image: getPetImagePath(egg.sprite_prefix, pet.stage, line, personality),
    stats,
    statSource: pet.stage < 4 ? "temporary-50" : "pet-only",
    config: forestConfig(stats),
  };
}
