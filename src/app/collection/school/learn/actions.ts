"use server";
import {getUser,createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {revalidatePath} from "next/cache";
import {validateGardenPath,type GardenPoint} from "@/lib/farm/garden-path";
import {GARDEN_BLUEPRINT,type BlueprintDiscovery} from "@/lib/farm/blueprints";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function learningGate(petId:string){
 const user=await getUser();if(!user)return {error:"เข้าสู่ระบบเพื่อเรียนกับ Qmon"};
 if(typeof petId!=="string"||!uuid.test(petId))return {error:"เลือก Qmon มาเรียนด้วยก่อน"};
 const db=await createClient();
 const [school,pet]=await Promise.all([
  db.from("farm_school_projects").select("status").eq("user_id",user.id).maybeSingle(),
  db.from("pets").select("id,stage").eq("user_id",user.id).eq("id",petId).maybeSingle()
 ]);
 if(school.error||pet.error)return {error:"ตรวจข้อมูลโรงเรียนไม่สำเร็จ ลองอีกครั้ง"};
 if(school.data?.status!=="placed")return {error:"วางโรงเรียนในฟาร์มก่อน แล้วกลับมาเรียนได้เลย"};
 if(!pet.data||pet.data.stage<2||pet.data.stage>4)return {error:"เลือก Qmon ที่ฟักเป็นตัวของเรา ระยะ 2–4"};
 return {userId:user.id};
}
export async function completeGardenLesson(petId:string,layout:unknown):Promise<{error?:string;valid?:boolean;message?:string;path?:GardenPoint[];discovery?:BlueprintDiscovery;created?:boolean}>{
 const gate=await learningGate(petId);if(gate.error)return {error:gate.error};
 const checked=validateGardenPath(layout);if(!checked.valid)return {valid:false,message:checked.message,path:checked.path};
 const {data,error}=await createAdminClient().rpc("farm_discover_blueprint",{p_user_id:gate.userId,p_pet_id:petId,p_blueprint_id:GARDEN_BLUEPRINT.id});
 if(error){console.error("Blueprint discovery failed",error.code);return {error:/^(วาง|เลือก|แบบ)/.test(error.message)?error.message:"บันทึกแบบไม่สำเร็จ กดเดินอีกครั้งได้"};}
 const result=data as {created:boolean;discovery:BlueprintDiscovery};
 revalidatePath("/collection/school");revalidatePath("/collection/school/learn");
 return {valid:true,message:checked.message,path:checked.path,discovery:result.discovery,created:result.created};
}
