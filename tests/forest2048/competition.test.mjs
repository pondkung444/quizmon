import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newReplay,replay,replayResult } from '../../src/lib/forest2048/replay.ts';
import { PGlite } from '@electric-sql/pglite';

export const companion={id:'11111111-1111-4111-8111-111111111111',name:'คู่หูทดสอบ',image:'/pets/egg1_stage4_math_A.png',eggPrefix:'egg1',stage:4,lane:'math',personality:'A',config:{hp:500,attack:25,armor:25,heal:40,bonus:.15,cooldown:5}};
export const input={version:3,runeVersion:1,balanceVersion:3,endlessVersion:1,relicVersion:1,skillVersion:1,accountId:'22222222-2222-4222-8222-222222222222',companion,questions:[['1+1',['2','3'],0,'https://example.com/question.png'],['2+2',['4','5'],0],['3+3',['6','7'],0]],hero:'math',seed:12345,routeSeed:12345,room:1,coins:0,relics:[],phase:'battle',revived:false,history:[]};
test('replay is deterministic and rejects forged choices, invalid swipes and oversized batches',()=>{
 const a=newReplay(input),b=newReplay(input);assert.deepEqual(a,b);
 assert.throws(()=>replay(a,[{type:'door',value:'stag'}]));
 assert.throws(()=>replay(a,[{type:'relic',value:'crown'}]));
 assert.throws(()=>replay(a,[{type:'swipe',value:'nonsense'}]));
 assert.throws(()=>replay(a,[{type:'score',value:99999}]));
 assert.throws(()=>replay(a,Array(257).fill({type:'end'})));
 const c=replay(a,[{type:'end'}]);assert.equal(replayResult(c).rooms,0);assert.equal(replayResult(c).status,'ended');assert.throws(()=>replay(c,[{type:'swipe',value:'left'}]));
});
test('a small legitimate bot receives relics, passes a boss, continues and replays across checkpoints',()=>{
 let s=newReplay(input),swipes=0;
 for(let step=0;step<800&&replayResult(s).rooms<9;step++){
  let e;
  if(s.run.phase==='battle'){
   let best,bestScore=-Infinity;
   for(const dir of ['left','up','right','down']){try{const candidate=replay(s,[{type:'swipe',value:dir}]);const score=(s.state.enemyHp-candidate.state.enemyHp)*3+(candidate.state.hp-s.state.hp)*2+candidate.state.armor+(16-candidate.state.board.filter(Boolean).length)*2;
    if(score>bestScore){bestScore=score;best={candidate,dir};}}catch{/* no-op swipes are invalid */}}
   assert.ok(best);s=best.candidate;swipes++;
  }else{
   const p=s.run.phase;
   if(p==='doors')e={type:'door',value:s.run.doors.includes('rest')?'rest':s.run.doors[0]};
   else if(p==='relic')e=s.run.offers.length?{type:'relic',value:s.run.offers[0]}:{type:'cash'};
   else if(p==='revivePrompt')e={type:'revive'};
   else if(['quiz','reviveQuiz'].includes(p))e={type:'answer',value:s.run.questions[s.run.quiz.ids[s.run.quiz.index]][2]};
   else if(p==='quizReward'&&s.run.quizPassed)e={type:'quizRelic'};
   else if(['rest','shop','quizReward'].includes(p))e={type:'utility'};
   else assert.fail('unexpected phase '+p);
   s=replay(s,[e]);
  }
 }
 assert.ok(replayResult(s).rooms>=9);assert.ok(s.run.relics.length>=3);assert.equal(replayResult(s).bosses,1);assert.equal(replayResult(s).swipes,swipes);
 const finished=replay(s,[{type:'end'}]);assert.equal(replayResult(finished).rooms,9);
});
test('losing, revival questions with images, failed revival and final status replay correctly',()=>{
 let s=newReplay({...input,companion:{...companion,config:{...companion.config,hp:1,attack:1,armor:0,heal:0}}});
 for(let n=0;n<30&&s.run.phase==='battle';n++){
  for(const dir of ['left','right','up','down']){try{s=replay(s,[{type:'swipe',value:dir}]);break;}catch{/* no-op */}}
 }
 assert.equal(s.run.phase,'revivePrompt');s=replay(s,[{type:'revive'}]);assert.equal(s.run.phase,'reviveQuiz');
 while(s.run.phase==='reviveQuiz'){const q=s.run.questions[s.run.quiz.ids[s.run.quiz.index]];s=replay(s,[{type:'answer',value:(q[2]+1)%q[1].length}]);}
 assert.equal(replayResult(s).status,'failed');assert.equal(replayResult(s).rooms,0);assert.equal(s.run.revived,true);
});
test('database checkpoints are atomic, retries do not double-count, shared ranks and owner isolation',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;
 create table public.profiles(id uuid primary key,username text);grant select on profiles to service_role;
 insert into auth.users values('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
 insert into profiles values('22222222-2222-4222-8222-222222222222','A'),('33333333-3333-4333-8333-333333333333','B');`);
 await db.exec(fs.readFileSync('doc/forest2048-competition-schema.sql','utf8'));
 const s=newReplay(input);
 for(const [id,user]of [['44444444-4444-4444-8444-444444444444',input.accountId],['55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333']]){
  await db.query('insert into forest2048_runs(id,user_id,engine_state)values($1,$2,$3)',[id,user,JSON.stringify(s)]);
  const args=[id,user,0,1,JSON.stringify(s),4,12,64,0,'active'];
  const q='select forest2048_checkpoint($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as accepted';
  await db.exec('set role service_role');assert.equal((await db.query(q,args)).rows[0].accepted,true);assert.equal((await db.query(q,args)).rows[0].accepted,false);await db.exec('reset role');
 }
 await db.exec('set role service_role');const board=(await db.query('select forest2048_board($1) as board',[input.accountId])).rows[0].board;
 assert.deepEqual(board.leaders.map(r=>r.rank),[1,1]);assert.equal(board.mine.rooms,4);assert.equal(board.players,2);
 const stats=(await db.query('select forest2048_stats($1) as stats',[input.accountId])).rows[0].stats;assert.equal(stats.runs,1);assert.equal(stats.swipes,12);
 await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${input.accountId}';`);
 assert.equal((await db.query('select * from forest2048_runs')).rows.length,1);
 await assert.rejects(db.query('update forest2048_runs set completed_rooms=99999'));
 await assert.rejects(db.query('select forest2048_board(null)'));
 await assert.rejects(db.query('delete from forest2048_scores'));
 }finally{await db.close();}
});
