import "server-only";
import { createClient, getUser } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";
import { schoolDisplayState, type SchoolPet, type SchoolProject } from "./school";

export async function loadSchoolProject(): Promise<SchoolProject | null> {
  const user = await getUser(); if (!user) return null;
  const db = await createClient();
  const {data,error} = await db.from("farm_school_projects").select("status,leader_id,resume_status,ready_at,remaining_seconds,round_deadline,failures,penalty_applied,tile_x,tile_y").eq("user_id",user.id).maybeSingle();
  if(error) throw new Error("ไม่สามารถโหลดงานโรงเรียนได้ กรุณาลองใหม่");
  return schoolDisplayState(data as SchoolProject | null);
}

export async function loadSchoolPets(): Promise<SchoolPet[]> {
  const user = await getUser(); if(!user) return [];
  const db = await createClient();
  const [pets,runs,gardens] = await Promise.all([
    db.from("pets").select("id,nickname,stage,subline,personality,egg_types(sprite_prefix,name_th)").eq("user_id",user.id).gte("stage",2).order("hatched_at",{ascending:false}),
    db.from("dungeon_runs").select("pet_id").eq("user_id",user.id).eq("status","in_progress"),
    db.from('farm_garden_projects').select('leader_id,status,ready_at').eq('user_id',user.id).not('leader_id','is',null),
  ]);
  if(pets.error || runs.error || gardens.error) throw new Error("ไม่สามารถโหลด Qmon สำหรับคุมงานได้");
  const busy = new Set((runs.data ?? []).map(row=>row.pet_id));for(const row of gardens.data??[])if(row.status==='building'||row.status==='puzzle'||(row.status==='finishing'&&Date.parse(row.ready_at)>Date.now()))busy.add(row.leader_id);
  return (pets.data ?? []).flatMap(row=>{
    const egg = Array.isArray(row.egg_types)?row.egg_types[0]:row.egg_types;
    if(!egg) return [];
    try {return [{id:row.id,name:row.nickname ?? getSpeciesName(egg.sprite_prefix,row.stage,row.subline as Subline,row.personality as Personality,egg.name_th),imagePath:getPetImagePath(egg.sprite_prefix,row.stage,row.subline as Subline,row.personality as Personality),stage:row.stage,busy:busy.has(row.id)}];}
    catch {return [];}
  });
}
