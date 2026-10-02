// Disposable account only. No credentials are written or printed; cleanup always runs.
import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';import {createServerClient} from '@supabase/ssr';
const base=process.env.FOREST_SMOKE_URL||'http://localhost:3048';
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let userId;const cookies=[];
const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>cookies,setAll:items=>{for(const c of items){const i=cookies.findIndex(x=>x.name===c.name);if(i>=0)cookies[i]=c;else cookies.push(c);}}}});
async function api(path,body,authenticated=true){const response=await fetch(base+'/api/2048/'+path,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',...(authenticated?{Cookie:cookies.map(c=>c.name+'='+c.value).join('; ')}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual'});const data=await response.json();return {status:response.status,data};}
try{
 const email='forest-smoke-'+randomBytes(8).toString('hex')+'@example.com',password=randomBytes(24).toString('base64url');
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username:'Forest smoke disposable'}});if(created.error)throw Error(created.error.message);userId=created.data.user.id;
 const profile=await admin.from('profiles').upsert({id:userId,username:'ForestSmoke'+randomBytes(5).toString('hex'),grade_level:'ม.1'});if(profile.error)throw Error(profile.error.message);
 const login=await auth.auth.signInWithPassword({email,password});if(login.error)throw Error(login.error.message);
 const {data:egg,error:eggError}=await admin.from('egg_types').select('id').eq('sprite_prefix','egg1').single();if(eggError)throw Error(eggError.message);
 const {data:pet,error:petError}=await admin.from('pets').insert({user_id:userId,egg_type_id:egg.id,stage:1,nickname:'Forest smoke disposable'}).select('id,exp,math_correct,science_correct').single();if(petError)throw Error(petError.message);
 const start=await api('start',{petId:pet.id,balanceVersion:4});assert.equal(start.status,200,JSON.stringify(start.data));assert.ok(start.data.initial.state.board.length===16);assert.equal(start.data.initial.run.balanceVersion,4);
 const id=start.data.competition.id,s=start.data.initial.state;
 // A direction that moves one of the two starting tiles. Reject no-op trials safely.
 let accepted,event;for(const dir of ['left','right','up','down']){event={type:'swipe',value:dir};const result=await api('competition',{id,from:0,events:[event]});if(result.status===200){accepted=result;break;}assert.equal(result.status,422);}
 assert.ok(accepted);assert.equal(accepted.data.revision,1);assert.equal(accepted.data.rooms,0);
 const retry=await api('competition',{id,from:0,events:[event]});assert.equal(retry.status,200);assert.equal(retry.data.revision,1);
 assert.equal((await api('competition',{id,from:1,events:[{type:'score',value:999999}]})).status,422);
 const foreign=await api('competition',{id:'99999999-9999-4999-8999-999999999999',from:0,events:[{type:'end'}]});assert.equal(foreign.status,404);
 assert.equal((await api('competition',{id,from:1,events:[{type:'end'}]},false)).status,401);
 const finish=await api('competition',{id,from:1,events:[{type:'end'}]});assert.equal(finish.status,200);assert.equal(finish.data.status,'ended');
 const old=await api('start',{petId:pet.id});assert.equal(old.status,200);assert.equal(old.data.initial.run.balanceVersion,3);assert.equal((await api('competition',{id:old.data.competition.id,from:0,events:[{type:'end'}]})).status,200);
 const board=await api('competition');assert.equal(board.status,200);assert.equal(board.data.stats.runs,2);assert.equal(board.data.stats.swipes,1);assert.equal(board.data.stats.finished,2);assert.equal(board.data.board.mine,null);
 const {data:after}=await admin.from('pets').select('exp,math_correct,science_correct').eq('id',pet.id).single();assert.deepEqual(after,{exp:pet.exp,math_correct:pet.math_correct,science_correct:pet.science_correct});
 console.log(JSON.stringify({actualApi:true,serverEngineFiles:true,authenticatedStart:true,newBalanceVersion4:true,oldTabsVersion3:true,idempotentRetry:true,forgedScoreRejected:true,foreignRunRejected:true,unauthenticatedWriteRejected:true,summaryStats:true,petCountersUnchanged:true,rooms:0}));
}finally{if(userId){const {error}=await admin.auth.admin.deleteUser(userId);if(error)throw Error('Disposable account cleanup failed: '+error.message);console.log('Disposable account and test runs removed');}}
