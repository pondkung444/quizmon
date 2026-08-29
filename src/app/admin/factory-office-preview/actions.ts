"use server";

import { revalidatePath } from "next/cache";
import { commandFactoryRun } from "@/lib/questionFactory/commandCenterServer";
import { getUser } from "@/lib/supabase/server";
import { controlFactoryRun } from "@/lib/questionFactory/runControlsServer";
import { randomUUID } from "node:crypto";

export type FactoryCommandState={ok:boolean;message:string;runId?:number};

export async function createFactoryCommandAction(_state:FactoryCommandState,formData:FormData):Promise<FactoryCommandState>{
  const user=await getUser();
  const admins=(process.env.ADMIN_EMAILS??"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(!user?.email||!admins.includes(user.email.toLowerCase())) return {ok:false,message:"ไม่มีสิทธิ์ผู้ดูแล"};
  try{
    const result=await commandFactoryRun({commandKey:String(formData.get("commandKey")??""),
      mappingId:String(formData.get("mappingId")??""),actorId:user.email,
      learningObjective:String(formData.get("learningObjective")??""),count:Number(formData.get("count")),
      easy:Number(formData.get("easy")),medium:Number(formData.get("medium")),hard:Number(formData.get("hard")),
      costLimitMicrounits:Number(formData.get("costLimitMicrounits"))});
    revalidatePath("/admin/factory-office-preview");
    return {ok:true,message:"สร้างและเริ่ม Run แล้ว",runId:Number(result.run_id)};
  }catch(error){return {ok:false,message:error instanceof Error?error.message:"สร้าง Run ไม่สำเร็จ"};}
}

export async function controlFactoryRunAction(_state:FactoryCommandState,formData:FormData):Promise<FactoryCommandState>{
  const user=await getUser();
  const admins=(process.env.ADMIN_EMAILS??"").split(",").map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(!user?.email||!admins.includes(user.email.toLowerCase())) return {ok:false,message:"ไม่มีสิทธิ์ผู้ดูแล"};
  const requested=String(formData.get("controlAction")??"");
  if(!["pause","resume","cancel"].includes(requested)) return {ok:false,message:"คำสั่งไม่ถูกต้อง"};
  try{
    const result=await controlFactoryRun({runKey:String(formData.get("runKey")??""),
      expectedStateVersion:Number(formData.get("stateVersion")),action:requested as "pause"|"resume"|"cancel",
      actorId:user.email,idempotencyKey:`qf:admin-control:${randomUUID()}`});
    revalidatePath("/admin/factory-office-preview");
    return {ok:true,message:`Run เปลี่ยนเป็น ${String(result.status)}`};
  }catch(error){return {ok:false,message:error instanceof Error?error.message:"ควบคุม Run ไม่สำเร็จ"};}
}
