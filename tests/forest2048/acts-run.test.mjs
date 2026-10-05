import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {newReplay,replay,replayResult,checkpointResult} from '../../src/lib/forest2048/replay.ts';

const companion={stage:4,eggPrefix:'egg1',lane:'math',personality:'A',config:{hp:100000,attack:10000,armor:5000,heal:40,bonus:.15,cooldown:5}};
const input={version:3,journeyVersion:1,balanceVersion:4,relicVersion:1,runeVersion:1,skillVersion:1,accountId:'fixture',companion,questions:[['1',['1','2'],0],['2',['2','3'],0],['3',['3','4'],0]],hero:'math',seed:12345,routeSeed:12345,coins:0,relics:[],revived:false,history:[]};
const files=['runes.js','skills.js','engine.js','run.js','endless.js','relics.js','relic-engine.js','relic-run.js','acts.js'];
function engine(random){const storage=new Map(),c=vm.createContext({assert,structuredClone,console,document:{querySelector:()=>({textContent:'',replaceChildren(){}})},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
 if(random!==undefined){c.fixtureRandom=random;vm.runInContext('Math.random=()=>fixtureRandom',c);}
 vm.runInContext(files.map(f=>fs.readFileSync('public/2048/'+f,'utf8')).join('\n')+`\nlet state,lastPanel;panel=(title,text,choices)=>{lastPanel={title,text,choices};};hidePanel=updateImages=render=runHUD=()=>{};`,c);c.input=structuredClone(input);vm.runInContext('run=input;initActJourney();',c);return c;}

test('new journey starts with deterministic choices, restores before room one and rejects unsupported saves',()=>{
 const a=newReplay(input),b=newReplay(input);assert.deepEqual(a,b);assert.equal(a.run.room,0);assert.equal(a.run.phase,'doors');assert.equal(a.run.doors.length,2);assert.equal(a.run.endlessVersion,undefined);assert.equal(replayResult(a).rooms,0);
 const c=engine();vm.runInContext(`persist();const saved=savedRun(saveKey());assert.equal(saved.room,0);const doors=JSON.stringify(run.doors);restoreRun(saved);assert.equal(JSON.stringify(run.doors),doors);run.journeyVersion=2;persist();assert.equal(savedRun(saveKey()),null);run.journeyVersion=1;run.room=31;persist();assert.equal(savedRun(saveKey()),null);`,c);
 assert.throws(()=>newReplay({...input,endlessVersion:1}));assert.throws(()=>newReplay({...input,journeyVersion:2}));assert.throws(()=>replay(a,[{type:'door',value:'stag'}]));
});

test('battle rune queue ignores unseeded demonstration tiles from fresh',()=>{
 const states=[.01,.99].map(random=>{const c=engine(random);vm.runInContext('enterDoor(run.doors[0]);',c);return JSON.parse(vm.runInContext('JSON.stringify({seed:run.seed,board:state.board,relic:state.relic})',c));});
 assert.deepEqual(states[0],states[1]);
});

test('all 30 room boundaries, weighted route independence, service cap and boss exceptions',()=>{
 const c=engine();vm.runInContext(`
 for(let seed=1;seed<=200;seed++){run.routeSeed=seed;run.serviceCounts={};run.history=[];for(let room=1;room<=30;room++){const d=actDoors(room),act=actDefinition(room),local=actLocalRoom(room);assert.equal(d.length,local===10?1:2);assert.equal(new Set(d).size,d.length);if(local===10)assert.equal(d[0],act.boss);if(local===9)assert.ok(d.includes('rest'));for(const id of d)if(ACT_ENEMIES[id])assert.equal(ACT_ENEMIES[id].act,actNumber(room));const before=JSON.stringify(d);run.seed+=71;assert.equal(JSON.stringify(actDoors(room)),before);}}
 run.serviceCounts={1:3,2:3,3:3};for(const room of [3,5,6,8,13,15,16,18,23,25,26,28])assert.ok(actDoors(room).every(id=>ACT_ENEMIES[id]));
 run.relics=['heavyCoin'];assert.ok(actDoors(9).includes('quiz'));assert.ok(!actDoors(9).includes('shop'));assert.throws(()=>actDoors(31));
 for(const act of ACTS){run.room=(ACTS.indexOf(act))*10+1;const stats=actStats(act.normal[0],run.room);assert.ok(stats.hp>0&&stats.interval>0);assert.throws(()=>actStats(ACTS[(ACTS.indexOf(act)+1)%3].normal[0],run.room));}
 `,c);
});

test('boss checkpoints heal once, carry once, keep revival and complete after third boss',()=>{
 const c=engine();vm.runInContext(`
 run.room=10;run.phase='battle';run.revived=true;state.hp=100;state.cfg.hp=1000;state.charge=2;state.enemy='stag';state.status='won';state.board=Array(16).fill(null);[2,4,8,64,256,512].forEach((v,i)=>state.board[i]={v,t:'a',f:2});state.board[4]={v:256,t:'x',awake:true,f:2};settleRun();assert.equal(state.hp,600);assert.equal(run.phase,'relic');assert.equal(run.history.length,1);assert.ok(run.offers.every(id=>id!=='crown'));const hp=state.hp;settleRun();assert.equal(state.hp,hp);persist();restoreRun(savedRun(saveKey()));assert.equal(state.hp,hp);const id=run.offers[0];chooseRelic(id);const relics=run.relics.length;chooseRelic(id);assert.equal(run.relics.length,relics);assert.equal(run.phase,'doors');enterDoor(run.doors[0]);assert.equal(run.room,11);assert.equal(state.hp,600);assert.equal(state.charge,2);assert.equal(run.revived,true);assert.ok(state.board.some(t=>t?.v===256&&t.awake));assert.ok(state.board.some(t=>t?.v===64));assert.ok(!state.board.some(t=>t?.v===8));assert.ok(!state.board.some(t=>t?.f));
 run.room=30;run.phase='battle';state.enemy='sky_guardian';state.status='won';settleRun();assert.equal(run.phase,'complete');assert.equal(run.history.at(-1).boss,true);const length=run.history.length;settleRun();assert.equal(run.history.length,length);
 `,c);
});

test('service choice is saved once, noRest counts as service and floors cannot be skipped',()=>{
 const c=engine();vm.runInContext(`
 run.room=2;run.phase='doors';run.doors=['rest','mushroom'];run.relics=['noRest'];state.hp=100;enterDoor('rest');assert.equal(run.room,3);assert.equal(run.serviceCounts[1],1);assert.equal(run.phase,'relic');assert.equal(state.hp,100);enterDoor('rest');assert.equal(run.serviceCounts[1],1);chooseRelic(run.offers[0]);assert.equal(run.phase,'doors');assert.ok(run.doors.every(id=>ACT_ENEMIES[id]));
 `,c);
});

test('all acts are playable using legitimate replay events, checkpoints and final victory is terminal',()=>{
 let s=newReplay(input),events=[],count=0;
 for(let step=0;step<1200&&s.run.phase!=='complete';step++){
  const phase=s.run.phase;let event;
  if(phase==='battle'){
   for(const dir of ['left','up','right','down']){try{replay(s,[{type:'swipe',value:dir}]);event={type:'swipe',value:dir};break;}catch{}}
   assert.ok(event,'a legal swipe remains');count++;
  }else if(phase==='doors')event={type:'door',value:s.run.doors.find(id=>['rest','quiz','shop'].includes(id))||s.run.doors[0]};
  else if(phase==='relic')event=s.run.offers.length?{type:'relic',value:s.run.offers[0]}:{type:'cash'};
  else if(phase==='quiz'||phase==='reviveQuiz')event={type:'answer',value:s.run.questions[s.run.quiz.ids[s.run.quiz.index]][2]};
  else if(phase==='quizReward'&&s.run.quizPassed)event={type:'quizRelic'};
  else if(['rest','shop','quizReward'].includes(phase))event={type:'utility'};
  else assert.fail('unexpected phase '+phase);
  s=replay(s,[event]);events.push(event);
 }
 assert.equal(s.run.phase,'complete');assert.equal(s.run.room,30);const result=replayResult(s);assert.equal(result.bosses,3);assert.equal(result.completed,true);assert.equal(result.status,'ended');assert.equal(result.swipes,count);assert.ok(result.rooms>=18&&result.rooms<=27);assert.equal(result.visitedRooms,30);
 assert.equal(checkpointResult(s).rooms,0);assert.equal(checkpointResult(s).bosses,0);
 let restored=newReplay(input);for(let i=0;i<events.length;i+=30)restored=replay(JSON.parse(JSON.stringify(restored)),events.slice(i,i+30));
 assert.deepEqual(replayResult(restored),result);assert.deepEqual(restored.run.history,s.run.history);assert.deepEqual(restored.run.doors,s.run.doors);assert.deepEqual(restored.run.serviceCounts,s.run.serviceCounts);
 assert.throws(()=>replay(s,[{type:'end'}]));assert.throws(()=>replay(s,[{type:'door',value:'mushroom'}]));
});

test('early exits and session analytics record before first battle and are replay validated',()=>{
 let s=newReplay(input);s=replay(s,[{type:'session',value:'leave'},{type:'session',value:'resume'}]);assert.deepEqual(s.run.sessionCounts,{resume:1,leave:1});assert.equal(s.run.lastSession.room,0);assert.throws(()=>replay(s,[{type:'session',value:'forge'}]));s=replay(s,[{type:'end'}]);assert.equal(s.run.journeyLog.at(-1).type,'end');assert.equal(replayResult(s).status,'ended');assert.equal(replayResult(s).rooms,0);
});
