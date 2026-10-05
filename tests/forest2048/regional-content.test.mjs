import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {newReplay,replay} from '../../src/lib/forest2048/replay.ts';
const companion={stage:4,eggPrefix:'egg1',lane:'math',personality:'A',config:{hp:1000,attack:20,armor:20,heal:10,bonus:.15,cooldown:5}};
const input={version:3,journeyVersion:1,mechanicsVersion:1,contentVersion:1,balanceVersion:4,relicVersion:1,runeVersion:1,skillVersion:1,accountId:'fixture',companion,questions:[['1',['1','2'],0],['2',['2','3'],0],['3',['3','4'],0]],hero:'math',seed:12345,routeSeed:12345,coins:0,relics:[],revived:false,history:[]};
const files=['runes.js','skills.js','engine.js','run.js','endless.js','relics.js','relic-engine.js','relic-run.js','acts.js','regional.js','regional-content.js'];
function engine(enemy='cave_guard'){const storage=new Map(),c=vm.createContext({assert,structuredClone,console,document:{querySelector:()=>({textContent:'',replaceChildren(){}})},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(files.map(f=>fs.readFileSync('public/2048/'+f,'utf8')).join('\n')+'\nlet state,lastPanel;panel=(title,text,choices)=>{lastPanel={title,text,choices};};hidePanel=updateImages=render=runHUD=()=>{};',c);c.input=structuredClone(input);c.enemy=enemy;
 vm.runInContext(`run=input;initActJourney();run.room=ACT_ENEMIES[enemy].act*10-9;enterBattle(enemy);state.cfg={...state.cfg,hp:1000,attack:100,armor:100,enemyHp:100000,interval:99,skillVersion:0};delete state.cfg.skillBase;state.hp=1000;state.enemyHp=100000;state.countdown=99;state.charge=0;state.board=Array(16).fill(null);state.hazards=undefined;regionalState(state);
 function put(i,v=2,t='a',life){state.board[i]={v,t,f:0};regionalStamp(state);if(life!==undefined)state.board[i].crack={remaining:life,bornMove:0};}
 function wall(cell,layers=2){regionalState(state).crystals.push({cell,layers});}
 function step(dir){return relicSwipe(state,dir,rng);}
 `,c);return c;}
const check=(c,code)=>vm.runInContext(code,c);


function own(c,ids){c.ids=ids;check(c,'run.relics=ids;state.cfg.relics=[...ids];');}
function merge(c,dir='left',source='swipe',chain=false){c.dir=dir;c.source=source;c.chain=chain;return check(c,`state.moves++;const result=regionalSlide(state.board,dir,state.cfg.rune,chain,true,state,state);state.board=result.board;relicMerges(state,result,dir,source,rng);result;`);}
test('regional catalog, stage restrictions, next-act boss reward and old-client exclusion',()=>{
 const c=engine();check(c,`assert.equal(REGIONAL_RELICS.length,20);assert.equal(new Set(REGIONAL_RELICS.map(r=>r.id)).size,20);run.room=9;assert.ok(!relicEligible(REGIONAL_RELICS[0]));run.rewardNextAct=2;assert.ok(relicEligible(REGIONAL_RELICS[0]));for(let i=0;i<50;i++){run.routeSeed=i+1;const offers=actRewardOffers(ACTS[1]);assert.equal(offers.length,3);assert.equal(offers.filter(id=>RELIC_V1.find(r=>r.id===id).region).length,1);}delete run.rewardNextAct;run.room=21;assert.ok(!relicEligible(REGIONAL_RELICS[0]));assert.ok(relicEligible(REGIONAL_RELICS[10]));run.companion.stage=2;assert.ok(!relicEligible(REGIONAL_RELICS.find(r=>r.id==='skyBandage')));delete run.contentVersion;assert.ok(REGIONAL_RELICS.every(r=>!relicEligible(r)));`);
});
test('enemy roles use explicit stats and light enemies generate no obstacles',()=>{
 const c=engine();check(c,`assert.deepEqual({...actStats('cave_healer',14)},{hp:84,damage:14,interval:3});assert.deepEqual({...actStats('sky_guardian',30)},{hp:1584,damage:43,interval:3});for(const enemy of ['cave_light','sky_light']){state.enemy=enemy;put(0);put(1);for(let n=1;n<=12;n++){state.moves=n;regionalEnd(state,()=>0);}assert.equal(state.hazards.crystals.length,0);assert.ok(!state.board.some(t=>t?.crack));}`);
});
test('hammer/lens warn two valid moves ahead; heart accelerates even an empty cave',()=>{
 const c=engine();own(c,['caveHammer','caveLens','caveHeart']);check(c,`put(0);put(1);state.moves=1;regionalEnd(state,()=>0);assert.equal(state.hazards.warning.dueMove-state.moves,2);state.moves=2;regionalEnd(state,()=>0);assert.equal(state.hazards.crystals.length,0);state.moves=3;regionalEnd(state,()=>0);assert.equal(state.hazards.crystals[0].layers,1);assert.equal(contentPeriod(state,4),3);`);
});
test('net halves enemy guard/power/heal and friendship removes these while capping additive bonus',()=>{
 const c=engine();own(c,['caveNet']);check(c,`wall(4);relicHit(state,100);assert.equal(state.enemyHp,99905);state.enemy='cave_heavy';assert.equal(enemyDamage(state),Math.ceil(beforeRegionalEnemyDamage(state)*1.05));state.cfg.relics=['caveFriend','drum'];assert.equal(contentCrystalRate(state),0);wall(5);wall(6);wall(7);assert.ok(Math.abs(relicFactor(state,{cell:1},'left','swipe',1)-1.58)<1e-9);assert.equal(relicFactor(state,{cell:1},'left','auto',1),1);state.enemy='cave_guard';state.enemyHp=100000;relicHit(state,100);assert.equal(state.enemyHp,99900);`);
});
test('break rewards charge once, armor, sword16 and seeded mine; neutral clears give none',()=>{
 const c=engine();own(c,['caveCharge','caveArmor','caveHeart','caveMine']);check(c,`put(0);put(1);wall(4,1);`);merge(c);check(c,`assert.equal(state.charge,1);assert.equal(state.armor,80);assert.equal(state.board[4].v,8);assert.equal(state.board[4].bornMove,state.moves);assert.equal(state.enemyHp,99910-Math.floor(runePower(state,16).a));assert.equal(state.hazards.stats.crystalsBroken,1);const hp=state.enemyHp,armor=state.armor,charge=state.charge;wall(5,1);regionalNeutral(state);assert.equal(state.enemyHp,hp);assert.equal(state.armor,armor);assert.equal(state.charge,charge);`);
});
test('adjacent shake and two-crystal chain multiply output without inventing combo or affecting gravity',()=>{
 const c=engine();own(c,['caveShake','caveChain']);check(c,`put(1);put(2);wall(0,1);wall(5,1);`);merge(c);check(c,`assert.equal(state.enemyHp,99792);assert.equal(state.maxCombo,1);assert.equal(state.hazards.stats.crystalsBroken,2);`);
 const g=engine();own(g,['caveChain']);check(g,`put(1);put(2);wall(0,1);wall(5,1);`);merge(g,'left','gravity');check(g,`assert.equal(state.enemyHp,99920);assert.equal(state.maxCombo,0);`);
});
test('glue extends to four moves; brave takes precedence and speeds crack generation',()=>{
 const c=engine('sky_guardian');own(c,['skyGlue']);check(c,`put(0);put(1);state.hazards.clock=2;state.moves=3;regionalEnd(state,()=>0);assert.equal(state.board.find(t=>t?.crack).crack.remaining,4);assert.ok(regionalValidSave(state));state.cfg.relics.push('skyBrave');assert.equal(contentLifetime(state),2);assert.equal(contentPeriod(state,3),2);`);
});
test('bandage counts rescued merges, breath extends once, glow upgrades result once for two cracks',()=>{
 const c=engine('sky_heavy');own(c,['skyBandage','skyBreath','skyGlow']);check(c,`put(0,2,'a',2);put(1,2,'a',2);put(8,8,'d',1);`);merge(c);check(c,`assert.equal(state.charge,1);assert.equal(state.board[0].v,8);assert.equal(state.enemyHp,99826);assert.equal(state.board[8].crack.remaining,2);assert.equal(state.hazards.stats.cracksSaved,2);contentAfterMerges(state,{merges:[{rescued:[1]}]},'gravity',rng,new Set([1]),[]);assert.equal(state.board[8].crack.remaining,2);`);
});
test('glow preserves original merge permissions and propagates chain ancestry',()=>{
 const c=engine('sky_heavy');own(c,['skyGlow']);check(c,`put(0,2,'a',3);put(1,2,'a');put(2,8,'a');`);const r=merge(c);assert.equal(r.merges.length,1);check(c,`assert.equal(state.board[0].v,8);assert.equal(state.board[1].v,8);`);
 const chain=engine('sky_heavy');own(chain,['skyGlow','chain']);check(chain,`put(0,2,'a',3);put(1,2,'a');put(2,4,'a',3);`);const rr=merge(chain,'left','swipe',true);assert.equal(rr.merges.length,2);check(chain,`assert.equal(state.board[0].v,32);assert.equal(state.hazards.stats.cracksSaved,2);`);
});
test('dew clears two poison stacks before output and immunity caps new stacks at two',()=>{
 const c=engine('sky_poison');own(c,['skyDew','skyImmunity']);check(c,`regionalPoison(state);regionalPoison(state);regionalPoison(state);assert.equal(state.poison.stacks,2);put(0,2,'h');put(1,2,'h');put(4,2,'a');put(5,2,'a');`);merge(c);check(c,`assert.equal(state.poison,undefined);assert.equal(state.enemyHp,99886);`);
});
test('expiry penalties happen before armor/heal rewards and newly applied poison can be cleansed',()=>{
 const c=engine('sky_guardian');own(c,['skyArmor','skyHeal']);check(c,`state.hp=500;state.armor=999;put(0,2,'a',1);put(1,2,'d',1);put(4,8,'a');state.moves=1;regionalEnd(state,()=>0);assert.equal(state.armor,108);assert.equal(state.hp,580);assert.equal(state.poison,undefined);assert.equal(state.countdown,98);assert.equal(state.hazards.stats.cracksExpired,2);`);
});
test('awaken converts poison to additive manual bonus while direct attack and new armor remain correctly scoped',()=>{
 const c=engine('sky_poison');own(c,['poisonAwaken','drum']);check(c,`state.poison={stacks:3,remaining:3,bornMove:0};assert.ok(Math.abs(relicFactor(state,{cell:0},'left','swipe',1)-1.7)<1e-9);assert.equal(relicFactor(state,{cell:0},'left','auto',1),1);relicHit(state,100);assert.equal(state.enemyHp,99900);regionalArmorScope(state,()=>state.armor+=100);assert.equal(state.armor,70);`);
});
test('new content replays across batches and rejects incompatible versions',()=>{
 assert.throws(()=>newReplay({...input,mechanicsVersion:undefined}),/รุ่นเนื้อหา/);assert.throws(()=>newReplay({...input,contentVersion:2}),/รุ่นเนื้อหา/);
 for(const enemy of ['cave_guardian','sky_guardian']){let start=newReplay({...input,companion:{...companion,config:{...companion.config,hp:1000000,attack:1}}});start.run.room=enemy.startsWith('cave')?19:29;start.run.relics=enemy.startsWith('cave')?['caveHammer','caveLens','caveMine','caveHeart']:['skyGlue','skyGlow','skyBreath','skyHeal'];start.run.doors=[enemy];start=replay(start,[{type:'door',value:enemy}]);let current=structuredClone(start);const events=[],c=engine(enemy);for(let n=0;n<60&&current.run.phase==='battle';n++){c.snapshot=current;const dir=check(c,"run=snapshot.run;state=snapshot.state;DIRS.find(dir=>regionalSlide(state.board,dir,state.cfg.rune,false,true,null,state).changed)");assert.ok(dir);events.push({type:'swipe',value:dir});current=replay(current,[events.at(-1)]);}const norm=s=>JSON.parse(JSON.stringify(s,(k,v)=>['started','ended'].includes(k)?undefined:v));assert.deepEqual(norm(replay(start,events)),norm(current));}
});

test('brave multiplies rescued output and old saved games keep previous enemy stats and relic offers',()=>{
 const c=engine('sky_heavy');own(c,['skyBrave']);check(c,`put(0,2,'a',2);put(1);`);merge(c);check(c,`assert.equal(state.enemyHp,99750);delete run.contentVersion;delete state.cfg.contentVersion;assert.deepEqual({...actStats('sky_guardian',30)},{...beforeContentStats('sky_guardian',30)});run.room=20;run.rewardNextAct=3;assert.ok(actRewardOffers(ACTS[2]).every(id=>!RELIC_V1.find(r=>r.id===id).region));`);
});
test('no-op leaves Phase 4 schedules, cracks and poison untouched; phase reset replans a full lens warning',()=>{
 const c=engine('cave_guardian');own(c,['caveHeart','caveLens']);check(c,`put(0);state.moves=1;regionalEnd(state,()=>0);state.hazards.pendingPhase=true;const before=JSON.stringify(state),seed=run.seed;assert.equal(step('left'),false);state.feedback=JSON.parse(before).feedback;assert.equal(JSON.stringify(state),before);assert.equal(run.seed,seed);assert.ok(step('right'));assert.equal(state.hazards.bossPhase,2);assert.equal(state.hazards.clock,1);assert.equal(state.hazards.warning.dueMove-state.moves,2);persist();assert.ok(savedRun(saveKey()));state.hazards.nextCrystalClock=-1;persist();assert.equal(savedRun(saveKey()),null);`);
});
test('net and friendship scale the healer after attack; healing never exceeds enemy maximum',()=>{
 for(const [ids,expected]of [[[],4000],[['caveNet'],2000],[['caveFriend'],0]]){const c=engine('cave_healer');own(c,ids);check(c,`put(0,8);put(1,4);wall(8);wall(9);state.enemyHp=50000;state.countdown=1;`);check(c,"step('right')");assert.equal(check(c,'state.enemyHp'),50000+expected);}
});

test('lens preserves its full lead when a valid target becomes available late',()=>{
 const c=engine();own(c,['caveLens']);check(c,`put(0);state.moves=2;state.hazards.clock=2;state.hazards.crystalPeriod=4;state.hazards.nextCrystalClock=3;contentCrystalTurn(state,()=>0,4,2);assert.equal(state.hazards.warning.dueMove-state.moves,2);`);
});
