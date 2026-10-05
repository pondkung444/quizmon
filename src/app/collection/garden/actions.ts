
"use server";
import {getUser} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {revalidatePath} from 'next/cache';
import type {GardenProject,GardenResult} from '@/lib/farm/garden';
import {validateGardenPath} from '@/lib/farm/garden-path';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function gardenCommand(operation:string,input:{projectId?:string;petId?:string;requestId?:string;layout?:unknown;x?:number;y?:number}={}):Promise<GardenResult>{
 const user=await getUser();if(!user)return {error:'เข้าสู่ระบบเพื่อสร้างสวน'};
 if(!['buy','resume','pause','begin','submit','place','refresh'].includes(operation))return {error:'คำสั่งไม่ถูกต้อง'};
 if(operation!=='buy'&&(!input.projectId||!uuid.test(input.projectId)))return {error:'เลือกโครงการสวนของเรา'};
 if(['buy','resume'].includes(operation)&&(!input.petId||!uuid.test(input.petId)))return {error:'เลือก Qmon คุมงานก่อน'};
 if(operation==='buy'&&(!input.requestId||!uuid.test(input.requestId)))return {error:'เปิดหน้าซื้อใหม่แล้วลองอีกครั้ง'};
 if(operation==='submit'&&JSON.stringify(input.layout??null).length>2048)return {error:'ข้อมูลทางเดินไม่ถูกต้อง'};
 if(operation==='place'&&(!Number.isInteger(input.x)||!Number.isInteger(input.y)))return {error:'เลือกช่องว่างที่ติดฟาร์ม'};
 const {data,error}=await createAdminClient().rpc('farm_garden_command',{p_user_id:user.id,p_operation:operation,p_project_id:input.projectId??null,p_pet_id:input.petId??null,p_request_id:input.requestId??null,p_layout:input.layout??null,p_x:input.x??null,p_y:input.y??null});
 if(error){console.error('Garden command failed',operation,error.code);return {error:/^(ต้อง|เลือก|เรียน|วาง|เหรียญ|Qmon|งาน|สวน|ยัง|เริ่ม|ไม่พบ|เปิด)/.test(error.message)?error.message:'บันทึกไม่สำเร็จ ลองใหม่ได้โดยไม่ซื้อซ้ำ'};}
 revalidatePath('/collection');revalidatePath('/collection/garden');revalidatePath('/collection/school/learn');revalidatePath('/collection/garden-plan');revalidatePath('/pet');
 const r=data as {project:GardenProject;server_now:string;message:string;passed:boolean};
 const hint=operation==='submit'&&!r.passed&&!r.message.startsWith('หมดเวลา')?validateGardenPath(input.layout).message:'';
 return {project:r.project,serverNow:r.server_now,message:hint||r.message,passed:r.passed};
}
