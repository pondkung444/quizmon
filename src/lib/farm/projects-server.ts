import 'server-only';
import {getUser} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import type {ProjectDefinition} from './catalogue';
import type {SchoolStatus} from './school';

export type FarmProject = {
 id:string;user_id:string;catalogue_id:string;rules_snapshot:ProjectDefinition;
 status:Exclude<SchoolStatus,'draft'>;checkpoint:number;ready_at:string|null;
 remaining_seconds:number;round_deadline:string|null;failures:number;penalty_applied:boolean;
 tile_x:number|null;tile_y:number|null;helper_count:number;
};
export type OwnerProject = {id:string;source:'legacy-school'|'legacy-garden'|'project';catalogue_id:string;save:Record<string,unknown>};
export async function loadOwnerProjects():Promise<OwnerProject[]> {
 const user=await getUser();if(!user)return [];
 const {data,error}=await createAdminClient().from('farm_project_compatibility').select('id,source,catalogue_id,save').eq('user_id',user.id);
 if(error)throw new Error('โหลดโครงการฟาร์มไม่สำเร็จ');
 return data as OwnerProject[];
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ProjectInput={projectId?:string;catalogueId?:string;requestId?:string;leaderId?:string;helperIds?:string[];x?:number;y?:number};
// Server-internal boundary for subsequent phases. No arbitrary RPC name or owner
// can be supplied, and no client-provided passed flag can complete a checkpoint.
export async function runProjectCommand(operation:'buy'|'refresh'|'pause'|'resume'|'team'|'begin'|'place',input:ProjectInput):Promise<FarmProject> {
 const user=await getUser();if(!user)throw new Error('ต้องเข้าสู่ระบบก่อน');
 const db=createAdminClient();
 if(operation==='buy'){
  if(!input.requestId||!uuid.test(input.requestId)||!input.leaderId||!uuid.test(input.leaderId)||!input.catalogueId)throw new Error('ข้อมูลซื้อโครงการไม่ถูกต้อง');
  const {data,error}=await db.rpc('farm_project_buy',{p_user:user.id,p_catalogue:input.catalogueId,p_request:input.requestId,p_leader:input.leaderId});
  if(error)throw new Error('ซื้อโครงการไม่สำเร็จ');return data as FarmProject;
 }
 if(!input.projectId||!uuid.test(input.projectId))throw new Error('เลือกโครงการของเรา');
 if(operation==='place'){
  if((input.x!==undefined&&!Number.isInteger(input.x))||(input.y!==undefined&&!Number.isInteger(input.y)))throw new Error('เลือกพื้นที่ให้ถูกต้อง');
  const {data,error}=await db.rpc('farm_project_place',{p_user:user.id,p_id:input.projectId,p_x:input.x??null,p_y:input.y??null});
  if(error)throw new Error('วางโครงการไม่สำเร็จ');return data as FarmProject;
 }
 if(!['refresh','pause','resume','team','begin'].includes(operation))throw new Error('คำสั่งไม่ถูกต้อง');
 if(['resume','team'].includes(operation)&&(!input.leaderId||!uuid.test(input.leaderId)||(input.helperIds??[]).some(id=>!uuid.test(id))||(input.helperIds??[]).length>3))throw new Error('เลือกทีมให้ถูกต้อง');
 const {data,error}=await db.rpc('farm_project_command',{p_user:user.id,p_id:input.projectId,p_operation:operation,p_leader:input.leaderId??null,p_helpers:input.helperIds??[]});
 if(error)throw new Error('บันทึกโครงการไม่สำเร็จ');return data as FarmProject;
}
