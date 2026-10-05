import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const db=new PGlite();
const u='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',pet='00000000-0000-4000-8000-000000000003',pet2='00000000-0000-4000-8000-000000000004',mission='00000000-0000-4000-8000-000000000005',req='00000000-0000-4000-8000-000000000006';
const solved=[{id:'bend-a',x:1,y:3,rotation:3},{id:'straight-a',x:1,y:2,rotation:0},{id:'bend-b',x:1,y:1,rotation:1},{id:'straight-b',x:2,y:1,rotation:1},{id:'bend-c',x:3,y:1,rotation:3}];
let checks=0;
async function rejects(sql,args,pattern){await assert.rejects(db.query(sql,args),pattern);checks++;}
async function scalar(sql,args=[]){return Object.values((await db.query(sql,args)).rows[0])[0];}
async function command(op,input={}){return scalar('select public.farm_garden_command($1,$2,$3,$4,$5,$6,$7,$8)',[u,op,input.id??null,input.pet??null,input.req??null,input.layout?JSON.stringify(input.layout):null,input.x??null,input.y??null]);}
try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table public.pets(id uuid primary key,user_id uuid,stage int,is_active boolean,exp int default 0);
create table public.daily_missions(id uuid primary key,user_id uuid,target_count int,bonus_exp smallint,bonus_awarded_at timestamptz);
create table public.quiz_attempts(id serial primary key,user_id uuid,mission_id uuid);
create table public.dungeon_runs(id serial primary key,pet_id uuid,user_id uuid,status text);
create table public.farm_school_projects(user_id uuid,status text,tile_x int,tile_y int);
create table public.farm_blueprint_discoveries(user_id uuid,blueprint_id text);
insert into auth.users values('${u}'),('${other}');insert into pets values('${pet}','${u}',2,true,0),('${pet2}','${u}',4,false,0);
insert into farm_school_projects values('${u}','placed',1,1);insert into farm_blueprint_discoveries values('${u}','garden-rest-v1');insert into daily_missions values('${mission}','${u}',5,10,null);
select set_config('request.jwt.claim.sub','${u}',false);`);
await db.exec(fs.readFileSync(root+'/supabase/migrations/20261005052159_farm_garden_construction.sql','utf8'));
assert.equal((await scalar('select farm_wallet_command($1)',[u])).balance,20);checks++;
assert.equal((await scalar('select farm_wallet_command($1)',[u])).balance,20);checks++;
await rejects('select * from farm_claim_daily_mission_bonus($1,null,auth.uid())',[mission],/ครบ/);
await db.query('insert into quiz_attempts(user_id,mission_id) select $1,$2 from generate_series(1,5)',[u,mission]);
assert.equal((await db.query('select * from farm_claim_daily_mission_bonus($1,$2,auth.uid())',[mission,'A'])).rows[0].awarded,true);checks++;
assert.equal(await scalar('select balance from farm_wallets where user_id=$1',[u]),40);checks++;
assert.equal((await db.query('select * from farm_claim_daily_mission_bonus($1,null,auth.uid())',[mission])).rows[0].awarded,false);checks++;
assert.equal(await scalar('select exp from pets where id=$1',[pet]),10);checks++;
await db.query("insert into dungeon_runs(pet_id,status) values($1,'in_progress')",[pet]);
await rejects('select farm_garden_command($1,\'buy\',null,$2,$3)',[u,pet,req],/ติดงาน/);
await db.exec('delete from dungeon_runs');
let r=await command('buy',{pet,req});const id=r.project.id;
assert.equal(r.project.status,'building');checks++;
assert.equal(await scalar('select balance from farm_wallets where user_id=$1',[u]),0);checks++;
assert.equal((await command('buy',{pet,req})).project.id,id);checks++;
await rejects('select farm_garden_command($1,\'buy\',null,$2,$3)',[u,pet2,'00000000-0000-4000-8000-000000000007'],/โครงการเดิม/);
await rejects('select farm_garden_command($1,\'refresh\',$2)',[other,id],/ไม่พบ/);
await rejects("insert into dungeon_runs(pet_id,status) values($1,'in_progress')",[pet],/คุมงานสวน/);
r=await command('pause',{id});assert.equal(r.project.status,'paused');assert.ok(r.project.remaining_seconds>295);checks++;
await db.query("insert into dungeon_runs(pet_id,status) values($1,'in_progress')",[pet]);
await rejects("select farm_garden_command($1,'resume',$2,$3)",[u,id,pet],/ติดงาน/);
r=await command('resume',{id,pet:pet2});assert.equal(r.project.leader_id,pet2);checks++;
await db.query("update farm_garden_projects set ready_at='2000-01-01' where id=$1",[id]);
r=await command('begin',{id});assert.equal(r.project.status,'puzzle');checks++;
const deadline=r.project.round_deadline;assert.equal((await command('begin',{id})).project.round_deadline,deadline);checks++;
for(let i=0;i<5;i++){await command('submit',{id,layout:[]});await command('begin',{id});}
r=await command('submit',{id,layout:solved});assert.equal(r.passed,true);assert.equal(r.project.remaining_seconds,360);checks++;
for(const value of [null,[],{},[null],solved.slice(1),solved.map(p=>({...p,x:0,y:0})),solved.map(p=>({...p,rotation:4}))]){assert.equal(await scalar('select farm_garden_valid($1)',[JSON.stringify(value)]),false);checks++;}
await db.query("update farm_garden_projects set ready_at='2000-01-01' where id=$1",[id]);
r=await command('refresh',{id});assert.equal(r.project.status,'ready');assert.equal(r.project.leader_id,null);checks++;
await rejects("select farm_garden_command($1,'place',$2,null,null,null,0,0)",[u,id],/ทับพื้นที่/);
await rejects("select farm_garden_command($1,'place',$2,null,null,null,99,99)",[u,id],/ติดฟาร์ม/);
r=await command('place',{id,x:2,y:1});assert.equal(r.project.status,'placed');checks++;
assert.equal(await scalar('select balance from farm_wallets where user_id=$1',[u]),20);checks++;
await command('place',{id,x:2,y:1});assert.equal(await scalar('select balance from farm_wallets where user_id=$1',[u]),20);checks++;
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${other}',false);`);
assert.equal((await db.query('select * from farm_wallets')).rows.length,0);assert.equal((await db.query('select * from farm_garden_projects')).rows.length,0);checks++;
await rejects('select farm_credit($1,\'hack\',999)',[other],/permission/);
await rejects("insert into farm_wallets values($1,999)",[other],/permission/);
await rejects("select farm_garden_command($1,'buy',null,$2,$3)",[u,pet,req],/permission/);
await db.exec('reset role');
console.log(`Garden SQL integration: ${checks} checks passed`);
}finally{await db.close();}
