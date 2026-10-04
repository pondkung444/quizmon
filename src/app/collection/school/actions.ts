"use server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { SchoolResult, SchoolProject } from "@/lib/farm/school";
import { validateFloor } from "@/lib/farm/floor-puzzle";

const operations = new Set(["start","resume","pause","begin","submit","place","refresh"]);
export async function schoolCommand(operation: string, input: {petId?:string;layout?:unknown;x?:number;y?:number} = {}): Promise<SchoolResult> {
  const user = await getUser();
  if(!user) return {error:"เข้าสู่ระบบเพื่อสร้างโรงเรียน"};
  if(!operations.has(operation)) return {error:"คำสั่งไม่ถูกต้อง"};
  if((operation==="start" || operation==="resume") && (!input.petId || !/^[0-9a-f-]{36}$/i.test(input.petId))) return {error:"เลือก Qmon คุมงานก่อน"};
  if(operation==="submit" && JSON.stringify(input.layout ?? null).length>2048) return {error:"ข้อมูลแผ่นพื้นไม่ถูกต้อง"};
  if(operation==="place" && (!Number.isInteger(input.x)||!Number.isInteger(input.y))) return {error:"เลือกพื้นที่ว่างที่เชื่อมกับฟาร์ม"};
  const {data,error} = await createAdminClient().rpc("farm_school_command",{p_user_id:user.id,p_operation:operation,p_pet_id:input.petId ?? null,p_layout:input.layout ?? null,p_x:input.x ?? null,p_y:input.y ?? null});
  if(error) {
    console.error("School command failed",operation,error.code);
    return {error:error.message.startsWith("Qmon") || /^(เลือก|ต้อง|งาน|ยัง|โรงเรียน|เริ่ม)/.test(error.message)?error.message:"บันทึกงานไม่สำเร็จ ลองอีกครั้งได้โดยไม่เริ่มงานซ้ำ"};
  }
  revalidatePath("/collection"); revalidatePath("/collection/school");
  const result = data as {project:SchoolProject;server_now:string;message:string;passed:boolean};
  const hint = operation==="submit" && !result.passed ? validateFloor(input.layout).message : "";
  return {project:result.project,serverNow:result.server_now,message:result.message.startsWith("หมดเวลา")?result.message:hint || result.message,passed:result.passed};
}
