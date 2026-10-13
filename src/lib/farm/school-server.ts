import "server-only";
import {farmBusyPets} from "./busy-pets";
import { createClient, getUser } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import { getSpeciesName } from "@/lib/petLine";
import type { Subline, Personality } from "@/lib/evolution";
import { schoolDisplayState, type SchoolPet, type SchoolProject } from "./school";

export async function loadSchoolProject(): Promise<SchoolProject | null> {
  const user = await getUser(); if (!user) return null;
  const db = await createClient();
  const fields="status,leader_id,resume_status,ready_at,remaining_seconds,round_deadline,failures,penalty_applied,tile_x,tile_y";
  let result = await db.from("farm_school_projects").select("draft_layout,"+fields).eq("user_id",user.id).maybeSingle();
  // The application can reach production before the additive draft migration.
  // Retry only this missing optional column; never hide other database failures.
  if(result.error && ["42703","PGRST204"].includes(result.error.code) && result.error.message.includes("draft_layout")) {
    result = await db.from("farm_school_projects").select(fields).eq("user_id",user.id).maybeSingle();
  }
  const {data,error}=result;
  if(error) throw new Error("ไม่สามารถโหลดงานโรงเรียนได้ กรุณาลองใหม่");
  return schoolDisplayState(data as SchoolProject | null);
}

export async function loadSchoolPets(): Promise<SchoolPet[]> {
  const user = await getUser(); if(!user) return [];
  const db = await createClient();
  const [pets,runs,gardens,farm] = await Promise.all([
    db.from("pets").select("id,nickname,stage,subline,personality,egg_types(sprite_prefix,name_th)").eq("user_id",user.id).gte("stage",2).order("hatched_at",{ascending:false}),
    db.from("dungeon_runs").select("pet_id").eq("user_id",user.id).eq("status","in_progress"),
    db.from('farm_garden_projects').select('leader_id,status,ready_at').eq('user_id',user.id).not('leader_id','is',null),
    farmBusyPets(db,user.id),
  ]);
  if(pets.error || runs.error || gardens.error) throw new Error("ไม่สามารถโหลด Qmon สำหรับคุมงานได้");
  const busy = new Set((runs.data ?? []).map(row=>row.pet_id));for(const row of gardens.data??[])if(row.status==='building'||row.status==='puzzle'||(row.status==='finishing'&&Date.parse(row.ready_at)>Date.now()))busy.add(row.leader_id);
  return (pets.data ?? []).flatMap(row=>{
    const egg = Array.isArray(row.egg_types)?row.egg_types[0]:row.egg_types;
    if(!egg) return [];
    try {return [{id:row.id,name:row.nickname ?? getSpeciesName(egg.sprite_prefix,row.stage,row.subline as Subline,row.personality as Personality,egg.name_th),imagePath:getPetImagePath(egg.sprite_prefix,row.stage,row.subline as Subline,row.personality as Personality),stage:row.stage,busy:busy.has(row.id)||!!farm.projectByPet[row.id],busyProjectId:farm.projectByPet[row.id],busyOther:busy.has(row.id)}];}
    catch {return [];}
  });
}
export async function loadConfirmedSchoolLevel():Promise<number>{
 const user=await getUser();if(!user)return 0;const db=await createClient();
 const [legacy,upgrades]=await Promise.all([
  db.from('farm_school_projects').select('status').eq('user_id',user.id).maybeSingle(),
  db.from('farm_projects').select('rules_snapshot').eq('user_id',user.id).eq('status','placed').eq('rules_snapshot->>place','school'),
 ]);
 if(legacy.error||upgrades.error&&!['42P01','PGRST205'].includes(upgrades.error.code))throw Error('โหลดระดับโรงเรียนไม่สำเร็จ');
 return (upgrades.data??[]).reduce((level,row)=>Math.max(level,Number(row.rules_snapshot?.targetLevel)||0),legacy.data?.status==='placed'?1:0);
}
export async function farmProjectSchemaAvailable():Promise<boolean>{
 const user=await getUser();if(!user)return false;const {error}=await (await createClient()).from('farm_catalogue').select('id').limit(1);
 if(error&&['42P01','PGRST205'].includes(error.code))return false;if(error)throw Error('โหลดสถานะระบบโครงการไม่สำเร็จ');return true;
}
