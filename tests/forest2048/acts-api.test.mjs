import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import ts from 'typescript';
import * as replayModule from '../../src/lib/forest2048/replay.ts';
const require=createRequire(import.meta.url),userId='22222222-2222-4222-8222-222222222222',petId='11111111-1111-4111-8111-111111111111',runId='44444444-4444-4444-8444-444444444444';
const companion={id:petId,stage:4,eggPrefix:'egg1',lane:'math',personality:'A',config:{hp:500,attack:25,armor:25,heal:40,bonus:.15,cooldown:5}},questions=[['1',['1','2'],0],['2',['2','3'],0],['3',['3','4'],0]];
function route(file,mocks){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>name in mocks?mocks[name]:require(name),Headers,console,Buffer,Date});return module.exports;}
const next={'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200,headers:options.headers})}}};
function request(body,method='POST'){return{headers:new Headers({origin:'https://fixture.test'}),nextUrl:new URL('https://fixture.test/api/2048'),json:async()=>body,text:async()=>JSON.stringify(body),method};}
test('real start handler always creates current three acts and rejects unsupported versions before writes',async()=>{
 const saved=[],api=route('src/app/api/2048/start/route.ts',{...next,
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:userId}}})}})},
 '@/lib/forest2048/companions':{ownedForestPets:async()=>[{}],forestCompanion:()=>companion},
 '@/lib/forest2048/questions':{forestQuestions:async()=>({questions,gradeBand:'junior'})},
 '@/lib/forest2048/replay':replayModule,
 '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({insert:value=>{saved.push(value);return{select:()=>({single:async()=>({data:{id:runId}})})};}})})}});
 const acts=await api.POST(request({petId,journeyVersion:1,balanceVersion:4}));assert.equal(acts.status,200);assert.equal(acts.body.initial.run.journeyVersion,1);assert.equal(acts.body.initial.run.endlessVersion,undefined);assert.equal(acts.body.initial.run.phase,'doors');assert.equal(acts.body.initial.run.room,0);assert.equal(saved[0].user_id,userId);
 const old=await api.POST(request({petId}));assert.equal(old.status,200);assert.equal(old.body.initial.run.endlessVersion,undefined);assert.equal(old.body.initial.run.journeyVersion,1);assert.equal(old.body.initial.run.balanceVersion,4);assert.equal(old.body.initial.run.phase,'doors');
 const invalid=await api.POST(request({petId,journeyVersion:2}));assert.equal(invalid.status,400);assert.equal(saved.length,2);
 for(const body of [{petId,journeyVersion:1,mechanicsVersion:2},{petId,contentVersion:2}])assert.equal((await api.POST(request(body))).status,400);
 assert.equal(saved.length,2);
 const mechanics=await api.POST(request({petId,mechanicsVersion:1}));assert.equal(mechanics.status,200);assert.equal(mechanics.body.initial.run.mechanicsVersion,1);assert.equal(acts.body.initial.run.mechanicsVersion,1);
 const content=await api.POST(request({petId,contentVersion:1}));assert.equal(content.status,200);assert.equal(content.body.initial.run.contentVersion,1);assert.equal(content.body.initial.state.cfg.contentVersion,1);const count=saved.length;assert.equal((await api.POST(request({petId,journeyVersion:1,mechanicsVersion:1,contentVersion:2}))).status,400);assert.equal(saved.length,count);
});
test('real leaderboard handler reads only the three-act board and private stats with validated pagination',async()=>{
 let user=userId;const calls=[];
 const api=route('src/app/api/2048/competition/route.ts',{...next,
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:user?{id:user}:null}})}})},
 '@/lib/forest2048/replay':replayModule,
 '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name.endsWith('board')?{leaders:[],mine:null,players:0}:{best:30}};}})}});
 const req=request(null,'GET');req.nextUrl.searchParams.set('page','2');assert.equal((await api.GET(req)).status,200);
 assert.deepEqual(calls.map(c=>c.name),['forest2048_acts_board','forest2048_acts_stats']);assert.equal(calls[0].args.p_page,2);assert.equal(calls[1].args.p_user,userId);
 calls.length=0;user=null;assert.equal((await api.GET(req)).status,200);assert.equal(calls.length,1);assert.equal(calls[0].args.p_user,null);
 req.nextUrl.searchParams.set('page','-1');assert.equal((await api.GET(req)).status,400);assert.equal(calls.length,1);
});
test('real checkpoint handler records early exits, deduplicates retries, enforces owner and isolates board',async()=>{
 let currentUser=userId;const initial=replayModule.newReplay({version:3,journeyVersion:1,relicVersion:1,runeVersion:1,skillVersion:1,balanceVersion:4,accountId:userId,companion,questions,hero:'math',seed:123,routeSeed:123,coins:0,relics:[],revived:false,history:[]});
 const row={id:runId,revision:0,engine_version:1,engine_state:initial,status:'active',completed_rooms:0,total_swipes:0,max_rune:0,bosses:0},writes=[];
 const api=route('src/app/api/2048/competition/route.ts',{...next,
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:currentUser}}})}})},
 '@/lib/forest2048/replay':replayModule,
 '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>{let owner;const query={select:()=>query,eq:(key,value)=>{if(key==='user_id')owner=value;return query;},maybeSingle:async()=>({data:owner===userId?row:null})};return query;},rpc:async(name,p)=>{assert.equal(name,'forest2048_checkpoint');writes.push(p);assert.equal(p.p_rooms,0);assert.equal(p.p_bosses,0);row.engine_state=p.p_state;row.revision=p.p_next;row.status=p.p_status;return{data:true};}})}});
 const body={id:runId,from:0,events:[{type:'session',value:'leave'},{type:'end'}]},result=await api.POST(request(body));assert.equal(result.status,200);assert.equal(result.body.status,'ended');assert.equal(result.body.journeyVersion,1);assert.equal(writes.length,1);assert.equal(row.engine_state.run.lastSession.room,0);assert.equal(row.engine_state.run.journeyLog.at(-1).type,'end');
 const retry=await api.POST(request(body));assert.equal(retry.status,200);assert.equal(retry.body.revision,2);assert.equal(retry.body.journeyVersion,1);assert.equal(writes.length,1);
 const terminal=await api.POST(request({id:runId,from:2,events:[{type:'door',value:'mushroom'}]}));assert.equal(terminal.status,409);
 currentUser='33333333-3333-4333-8333-333333333333';assert.equal((await api.POST(request(body))).status,404);
});
