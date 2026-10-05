import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {newReplay,replay} from '../../src/lib/forest2048/replay.ts';
const companion={stage:4,eggPrefix:'egg1',lane:'math',personality:'A',config:{hp:1000,attack:20,armor:20,heal:10,bonus:.15,cooldown:5}};
const input={version:3,journeyVersion:1,mechanicsVersion:1,balanceVersion:4,relicVersion:1,runeVersion:1,skillVersion:1,accountId:'fixture',companion,questions:[['1',['1','2'],0],['2',['2','3'],0],['3',['3','4'],0]],hero:'math',seed:12345,routeSeed:12345,coins:0,relics:[],revived:false,history:[]};
const files=['runes.js','skills.js','engine.js','run.js','endless.js','relics.js','relic-engine.js','relic-run.js','acts.js','regional.js'];
function engine(enemy='cave_guard'){const storage=new Map(),c=vm.createContext({assert,structuredClone,console,document:{querySelector:()=>({textContent:'',replaceChildren(){}})},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(files.map(f=>fs.readFileSync('public/2048/'+f,'utf8')).join('\n')+'\nlet state,lastPanel;panel=(title,text,choices)=>{lastPanel={title,text,choices};};hidePanel=updateImages=render=runHUD=()=>{};',c);c.input=structuredClone(input);c.enemy=enemy;
 vm.runInContext(`run=input;initActJourney();run.room=ACT_ENEMIES[enemy].act*10-9;enterBattle(enemy);state.cfg={...state.cfg,hp:1000,attack:100,armor:100,enemyHp:100000,interval:99,skillVersion:0};delete state.cfg.skillBase;state.hp=1000;state.enemyHp=100000;state.countdown=99;state.charge=0;state.board=Array(16).fill(null);state.hazards=undefined;regionalState(state);
 function put(i,v=2,t='a',life){state.board[i]={v,t,f:0};regionalStamp(state);if(life!==undefined)state.board[i].crack={remaining:life,bornMove:0};}
 function wall(cell,layers=2){regionalState(state).crystals.push({cell,layers});}
 function step(dir){return relicSwipe(state,dir,rng);}
 `,c);return c;}
const check=(c,code)=>vm.runInContext(code,c);

test('save validation rejects corrupt states and accepts a journey before room one',()=>{
 const c=engine();check(c,`put(0);persist();assert.ok(savedRun(saveKey()));state.hazards.crystals=[{cell:0,layers:2}];persist();assert.equal(savedRun(saveKey()),null);state.hazards.crystals=[];state.board[0].uid=0;persist();assert.equal(savedRun(saveKey()),null);state.board[0].uid=1;state.poison={stacks:4,remaining:3,bornMove:0};persist();assert.equal(savedRun(saveKey()),null);delete state.poison;initActJourney();persist();assert.ok(savedRun(saveKey()));assert.ok(regionalValidSave(state));`);
});
test('phase-two cadence, caps and intro exceptions are independent of enemy countdown',()=>{
 const cave=engine('cave_guardian');check(cave,`put(0);put(1);regionalState(state).bossPhase=2;state.moves=1;state.countdown=90;regionalEnd(state,()=>0);assert.ok(regionalState(state).warning);state.moves=2;regionalEnd(state,()=>0);assert.equal(regionalState(state).crystals.length,1);assert.equal(state.countdown,90);`);
 const sky=engine('sky_guardian');check(sky,`for(let i=0;i<4;i++)put(i,2,'a',3);regionalState(state).bossPhase=2;regionalState(state).clock=1;state.moves=1;regionalEnd(state,()=>0);assert.equal(regionalState(state).stats.cracksApplied,0);state.enemy='sky_intro';for(const t of state.board)if(t)delete t.crack;regionalState(state).clock=3;state.moves++;regionalEnd(state,()=>0);assert.ok(!state.board.some(t=>t?.crack));`);
});

test('all 36 Auto casts avoid crystals and shadow copies never inherit crack identities',()=>{
 for(const egg of ['egg1','egg2','egg3','egg4','egg5','egg6'])for(let index=0;index<6;index++){
  const c=engine();c.egg=egg;c.index=index;check(c,`put(4,16,'x',3);put(5,8,'d');wall(0);state.cfg.skillVersion=1;state.cfg.autoSkill={egg,index};state.cfg.rune=egg;state.cfg.relicShadow=true;state.charge=state.cfg.cooldown;state.poison={stacks:3,remaining:3,bornMove:0};const beforeArmor=state.armor;assert.equal(autoCast(state,()=>0),true);assert.equal(state.board[0],null);assert.ok(!autoState(state).marks.some(m=>m.cell===0));assert.ok(state.board[4].crack);const copies=state.board.filter(t=>t&&t.uid!==state.board[4].uid);assert.ok(copies.every(t=>!t.crack));assert.ok(state.armor>=beforeArmor);assert.equal(Object.getOwnPropertyDescriptor(state,'armor').get,undefined);`);
 }
});
test('existing marks remain under a crystal and are consumed only after it is gone',()=>{
 const c=engine();check(c,`put(4);put(5);wall(0,1);autoState(state).marks=[{cell:0,kind:'arrow',uses:2}];state.moves=1;let r=regionalSlide(state.board,'left',state.cfg.rune,false,true,state,state);state.board=r.board;relicMerges(state,r,'left','swipe',rng);assert.equal(autoState(state).marks[0].uses,2);assert.equal(regionalState(state).crystals.length,0);put(0);put(1);r=regionalSlide(state.board,'left',state.cfg.rune,false,true,state,state);assert.equal(autoState(state).marks[0].uses,1);`);
});
test('real cave and sky mechanic events replay identically across checkpoint batches',()=>{
 for(const enemy of ['cave_guardian','sky_guardian']){
  const fixture={...input,companion:{...companion,config:{...companion.config,hp:1000000,attack:1,armor:10}}};let start=newReplay(fixture);start.run.room=enemy==='cave_guardian'?19:29;start.run.doors=[enemy];start=replay(start,[{type:'door',value:enemy}]);let current=structuredClone(start);const events=[],c=engine(enemy);
  for(let n=0;n<100&&current.run.phase==='battle';n++){c.snapshot=structuredClone(current);const dir=check(c,"state=snapshot.state;run=snapshot.run;DIRS.map(dir=>({dir,r:regionalSlide(state.board,dir,state.cfg.rune,false,true,null,state)})).filter(x=>x.r.changed).sort((a,b)=>a.r.merges.length-b.r.merges.length)[0]?.dir");assert.ok(dir);const event={type:'swipe',value:dir};events.push(event);current=replay(current,[event]);}
  const normalize=s=>JSON.parse(JSON.stringify(s,(key,value)=>['started','ended'].includes(key)?undefined:value));assert.deepEqual(normalize(replay(start,events)),normalize(current));
  const stats=current.state.hazards?.stats||current.run.history.at(-1)?.mechanics;assert.ok(enemy==='cave_guardian'?stats.crystalsPlaced>0:stats.cracksApplied>0);
 }
});

test('crystals block slide, spawn, targets and new marks without behaving as numbered runes',()=>{
 const c=engine();check(c,`put(0);put(2);wall(1);const r=regionalSlide(state.board,'left',state.cfg.rune,false,true,state,state);assert.equal(r.merges.length,0);assert.equal(r.board[0].v,2);assert.equal(r.board[2].v,2);assert.equal(r.board[1],null);for(let n=0;n<10;n++){spawn(state,()=>0);autoMark(state,'arrow',()=>0);}assert.equal(state.board[1],null);assert.ok(!autoState(state).marks.some(m=>m.cell===1));assert.ok(!autoTargets(state,()=>true,16).includes(1));`);
});
test('crystal damage snapshots and adjacent manual/gravity merges hit a crystal only once per swipe',()=>{
 const c=engine();check(c,`put(0);put(1);wall(4,1);state.moves=1;const r=regionalSlide(state.board,'left',state.cfg.rune,false,true,state,state);state.board=r.board;relicMerges(state,r,'left','swipe',rng);assert.equal(state.enemyHp,99910);assert.equal(regionalState(state).crystals.length,0);assert.equal(regionalState(state).stats.crystalsBroken,1);relicHit(state,100);assert.equal(state.enemyHp,99810);
 wall(4,2);relicMerges(state,r,'left','gravity',rng);assert.equal(regionalState(state).crystals[0].layers,1);relicMerges(state,r,'left','gravity',rng);assert.equal(regionalState(state).crystals[0].layers,1);`);
});
test('crystal warning precedes placement, occupied warning is skipped and intro/caps do not spawn',()=>{
 const c=engine();check(c,`put(0);put(1);state.moves=3;regionalState(state).clock=2;regionalEnd(state,()=>0);assert.ok(regionalState(state).warning);const cell=regionalState(state).warning.cell;put(cell,8);state.moves=4;regionalEnd(state,()=>0);assert.equal(regionalState(state).crystals.length,0);assert.equal(regionalState(state).warning,null);
 state.board[cell]=null;regionalState(state).warning={cell};regionalState(state).clock=3;state.moves=8;regionalEnd(state,()=>0);assert.equal(regionalState(state).crystals.length,1);assert.equal(regionalState(state).crystals[0].layers,2);
 state.enemy='cave_intro';regionalState(state).crystals=[];regionalState(state).warning={cell};regionalState(state).clock=3;regionalEnd(state,()=>0);assert.equal(regionalState(state).crystals.length,0);`);
});
test('no-op advances neither hazard clock, poison/cracks, pending phase nor RNG',()=>{
 const c=engine();check(c,`put(0,2,'a',3);state.poison={stacks:2,remaining:3,bornMove:0};regionalState(state).pendingPhase=true;const before=JSON.stringify({seed:run.seed,board:state.board,h:state.hazards,p:state.poison,moves:state.moves,charge:state.charge});assert.equal(step('left'),false);assert.equal(JSON.stringify({seed:run.seed,board:state.board,h:state.hazards,p:state.poison,moves:state.moves,charge:state.charge}),before);`);
});
test('crack identities move, two cracked sources are rescued, transformations do not rescue',()=>{
 const c=engine('sky_heavy');check(c,`put(2,2,'a',1);const id=state.board[2].uid;const moved=regionalSlide(state.board,'left',state.cfg.rune,false,true,null,state);assert.equal(moved.board[0].uid,id);assert.equal(moved.board[0].crack.remaining,1);autoRaise(state.board[2]);assert.equal(state.board[2].crack.remaining,1);put(3,4,'a',1);state.moves=1;const r=regionalSlide(state.board,'left',state.cfg.rune,false,true,state,state);state.board=r.board;relicMerges(state,r,'left','swipe',rng);assert.equal(regionalState(state).stats.cracksSaved,2);assert.ok(!state.board.some(t=>t?.crack));`);
});
test('cracks target an existing pair, skip newborns, and expire once with ordered boss penalties',()=>{
 const c=engine('sky_guardian');check(c,`put(0);put(1);put(2,4);state.board[2].bornMove=4;state.moves=4;regionalState(state).clock=2;regionalEnd(state,()=>0);assert.equal(state.board[0].crack.remaining,3);assert.equal(state.board[0].crack.bornMove,4);assert.ok(!state.board[2].crack);
 state.board[0].crack={remaining:1,bornMove:4};state.board[1].crack={remaining:1,bornMove:4};state.moves=5;state.armor=80;state.countdown=3;regionalEnd(state,()=>0);assert.equal(regionalState(state).stats.cracksExpired,2);assert.equal(state.armor,0);assert.equal(state.countdown,2);assert.equal(state.poison.stacks,1);assert.equal(state.poison.remaining,3);assert.equal(state.board[0],null);assert.equal(state.board[1],null);`);
});
test('last-deadline gravity merge rescues cracks before expiration without aging them twice',()=>{
 const c=engine('sky_heavy');check(c,`put(0,2,'a',1);put(4,2,'a',1);state.moves=1;const g=regionalSlide(state.board,'down',state.cfg.rune,false,false,state,state);state.board=g.board;relicMerges(state,g,'down','gravity',rng);regionalEnd(state,rng);assert.equal(regionalState(state).stats.cracksSaved,2);assert.equal(regionalState(state).stats.cracksExpired,0);`);
});
test('poison cleanses from all heal merges before simultaneous output, even at full HP',()=>{
 for(const order of [0,1]){const c=engine('sky_poison');c.order=order;check(c,`state.poison={stacks:2,remaining:3,bornMove:0};if(order){put(0,2,'h');put(1,2,'h');put(4);put(5);}else{put(0);put(1);put(4,2,'h');put(5,2,'h');}state.moves=1;const r=regionalSlide(state.board,'left',state.cfg.rune,false,true,state,state);state.board=r.board;relicMerges(state,r,'left','swipe',rng);assert.equal(state.poison.stacks,1);assert.equal(state.hp,1000);assert.equal(state.enemyHp,99898);assert.equal(state.armor,0);`);}
});
test('poison limits, expiry, refresh, Auto and armor are emitted once; thorns bypass only poison',()=>{
 const c=engine('cave_guard');check(c,`wall(4,2);regionalPoison(state);regionalPoison(state);regionalPoison(state);regionalPoison(state);assert.equal(state.poison.stacks,3);autoHit(state,100);assert.equal(state.enemyHp,99937);regionalArmorScope(state,()=>{state.armor+=100;state.armor+=100;});assert.equal(state.armor,140);assert.equal(Object.getOwnPropertyDescriptor(state,'armor').get,undefined);
 state.regionalReflection=true;relicHit(state,100,true);delete state.regionalReflection;assert.equal(state.enemyHp,99847);state.moves=1;put(0);regionalEnd(state,rng);assert.equal(state.poison.remaining,2);regionalPoison(state);assert.equal(state.poison.remaining,3);for(let n=0;n<3;n++){state.moves++;regionalEnd(state,rng);}assert.equal(state.poison,undefined);`);
});
test('boss transition is pending until next valid swipe, survives healing and forest root count changes',()=>{
 const c=engine('stag');check(c,`state.cfg.enemyHp=1000;state.enemyHp=1000;put(0);put(1);relicHit(state,500);assert.equal(regionalState(state).pendingPhase,true);state.enemyHp=900;assert.equal(step('up'),false);assert.equal(regionalState(state).bossPhase,1);state.countdown=1;state.cfg.attack=0;step('left');assert.equal(regionalState(state).bossPhase,2);assert.ok(state.board.filter(t=>t?.f).length<=3);assert.equal(regionalState(state).pendingPhase,false);`);
 const real=newReplay(input);const saved=replay(real,[{type:'door',value:real.run.doors[0]}]);assert.equal(saved.run.mechanicsVersion,1);assert.throws(()=>newReplay({...input,mechanicsVersion:2}));assert.throws(()=>newReplay({...input,journeyVersion:undefined}));
});
test('cave power and healing count living crystals, healing cannot revive a killed enemy',()=>{
 const c=engine('cave_healer');check(c,`put(0);wall(4);wall(5);state.cfg.enemyHp=1000;state.enemyHp=500;state.cfg.attack=0;state.countdown=1;step('right');assert.equal(state.enemyHp,540);state.enemy='cave_heavy';assert.equal(enemyDamage(state),Math.ceil(state.cfg.damage*1.5*1.2));state.enemyHp=0;finish(state);assert.equal(state.status,'won');assert.equal(regionalState(state).crystals.length,0);`);
});
test('blocked-board recovery and explosion clear obstacles/cracks neutrally, preserve poison',()=>{
 for(const explode of [false,true]){const c=engine('sky_heavy');c.explode=explode;check(c,`for(let i=0;i<16;i++)put(i,2**(i+1),'d',1);wall(0);state.board[0]=null;state.poison={stacks:1,remaining:3,bornMove:0};if(explode){run.relics=['explosion'];state.cfg.relics=run.relics;}recover(state);assert.equal(regionalState(state).stats.cracksSaved,0);assert.equal(regionalState(state).stats.cracksExpired,0);assert.equal(regionalState(state).crystals.length,0);assert.ok(!state.board.some(t=>t?.crack));assert.ok(regionalCanMove(state));assert.equal(state.hp,explode?1000:750);assert.equal(state.poison.stacks,1);`);}
});
test('revival keeps movable hazards/poison and only clears blocked boards; carry removes battle statuses',()=>{
 const c=engine('sky_poison');check(c,`put(0,2,'a',2);wall(4);state.poison={stacks:1,remaining:3,bornMove:0};state.status='lost';state.hp=0;run.phase='reviveQuiz';run.revived=true;run.quiz={ids:[0,1,2],index:2,correct:2};answer(0);assert.equal(state.hp,300);assert.equal(state.poison.stacks,1);assert.equal(regionalState(state).crystals.length,1);assert.ok(state.board.some(t=>t?.crack));state.status='won';finish(state);assert.equal(state.poison,undefined);assert.ok(!state.board.some(t=>t?.crack));run.room=24;enterBattle('sky_heavy');assert.equal(regionalState(state).clock,0);assert.equal(regionalState(state).crystals.length,0);persist();const saved=savedRun(saveKey());restoreRun(saved);assert.deepEqual(state.hazards,saved.battle.hazards);`);
});
test('new mechanic checkpoints replay identically with batching and keep phase-2 saves unchanged',()=>{
 let a=newReplay(input),b=structuredClone(a);const first={type:'door',value:a.run.doors[0]};a=replay(a,[first]);b=replay(b,[first]);const events=[];for(let n=0;n<30&&a.run.phase==='battle';n++){const c=engine();c.snapshot=structuredClone(a);const dir=check(c,'state=snapshot.state;run=snapshot.run;DIRS.find(d=>regionalCanMove({...state,board:regionalSlide(state.board,d,state.cfg.rune,false,true,null,state).board})&&regionalSlide(state.board,d,state.cfg.rune,false,true,null,state).changed)');if(!dir)break;const e={type:'swipe',value:dir};events.push(e);a=replay(a,[e]);}b=replay(b,events);delete a.state.started;delete b.state.started;delete a.state.ended;delete b.state.ended;assert.deepEqual(a,b);
 const old=newReplay({...input,mechanicsVersion:undefined});assert.equal(old.state.cfg.mechanicsVersion,undefined);assert.equal(old.state.hazards,undefined);
});
