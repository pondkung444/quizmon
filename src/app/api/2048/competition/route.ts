import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { replay, replayResult, type ForestEvent } from '@/lib/forest2048/replay';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request:NextRequest){
 try {
  const auth=await createClient();const {data:{user}}=await auth.auth.getUser();
  const admin=createAdminClient();
  const page=Number(request.nextUrl.searchParams.get('page')||0);
  if(!Number.isSafeInteger(page)||page<0||page>100000)return json({error:'หน้าอันดับไม่ถูกต้อง'},400);
  const {data:board,error}=await admin.rpc('forest2048_board',{p_user:user?.id??null,p_page:page});
  if(error)throw error;
  if(!user)return json({board});
  const {data:stats,error:statsError}=await admin.rpc('forest2048_stats',{p_user:user.id});
  if(statsError)throw statsError;
  return json({board,stats});
 }catch{return json({error:'โหลดอันดับไม่สำเร็จ ลองใหม่อีกครั้ง'},503);}
}
export async function POST(request:NextRequest){
 if(request.headers.get('origin') && request.headers.get('origin')!==request.nextUrl.origin)return json({error:'คำขอไม่ถูกต้อง'},403);
 // Bound work and memory per request; there is no cap on the length of a journey.
 if(Number(request.headers.get('content-length')||0)>24000)return json({error:'คำขอใหญ่เกินไป'},413);
 const raw=await request.text();if(raw.length>24000)return json({error:'คำขอใหญ่เกินไป'},413);
 let body;try{body=JSON.parse(raw);}catch{return json({error:'คำขอไม่ถูกต้อง'},400);}
 if(!body||typeof body.id!=='string'||!uuid.test(body.id)||!Number.isSafeInteger(body.from)||body.from<0||
  !Array.isArray(body.events)||!body.events.length||body.events.length>256||!Number.isSafeInteger(body.from+body.events.length)||
  body.events.some((e:ForestEvent)=>!e||typeof e.type!=='string'||e.type.length>16||
   (e.value!==undefined && !((typeof e.value==='string'&&e.value.length<=50)||(typeof e.value==='number'&&Number.isSafeInteger(e.value))))))
  return json({error:'คำสั่งไม่ถูกต้อง'},400);
 try{
  const auth=await createClient();const {data:{user},error:authError}=await auth.auth.getUser();
  if(authError||!user)return json({error:'กรุณาเข้าสู่ระบบอีกครั้ง'},401);
  const admin=createAdminClient();
  // Revision compare-and-swap makes retries and concurrent requests idempotent.
  for(let attempt=0;attempt<3;attempt++){
   const {data:row,error}=await admin.from('forest2048_runs').select('id,revision,engine_version,engine_state,status,completed_rooms,total_swipes,max_rune,bosses')
    .eq('id',body.id).eq('user_id',user.id).maybeSingle();
   if(error)throw error;if(!row)return json({error:'ไม่พบการเดินทางนี้'},404);
   if(body.from>row.revision)return json({error:'ลำดับการเล่นไม่ตรงกัน',revision:row.revision},409);
   const events=body.events.slice(row.revision-body.from);
   if(!events.length)return json({revision:row.revision,rooms:row.completed_rooms,status:row.status});
   if(row.status!=='active')return json({error:'การเดินทางนี้จบแล้ว',revision:row.revision},409);
   if(row.engine_version!==1)return json({error:'รุ่นการเดินทางไม่รองรับ'},409);
   let snapshot;try{snapshot=replay(row.engine_state,events);}catch(error){return json({error:error instanceof Error?error.message:'การเล่นไม่ถูกต้อง'},422);}
   const result=replayResult(snapshot),next=row.revision+events.length;
   const {data:accepted,error:saveError}=await admin.rpc('forest2048_checkpoint',{p_id:row.id,p_user:user.id,p_revision:row.revision,p_next:next,
    p_state:snapshot,p_rooms:result.rooms,p_swipes:result.swipes,p_rune:result.maxRune,p_bosses:result.bosses,p_status:result.status});
   if(saveError)throw saveError;
   if(accepted)return json({revision:next,...result});
  }
  return json({error:'กำลังบันทึกพร้อมกัน กรุณาลองใหม่'},409);
 }catch{return json({error:'ยังบันทึกผลไม่ได้ ระบบจะลองส่งใหม่'},503);}
}
