import "server-only";
import {createClient,getUser} from "@/lib/supabase/server";
import type {BlueprintDiscovery} from "./blueprints";
export async function loadBlueprintDiscoveries():Promise<BlueprintDiscovery[]>{
 const user=await getUser();if(!user)return [];
 const db=await createClient();
 const {data,error}=await db.from("farm_blueprint_discoveries").select("blueprint_id,pet_id,completed_at").eq("user_id",user.id);
 if(error)throw new Error("โหลดสมุดแบบสร้างไม่สำเร็จ ลองใหม่อีกครั้ง");
 return data??[];
}
