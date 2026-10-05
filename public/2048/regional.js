'use strict';
// Only new mechanicsVersion=1 journeys use these rules. Existing checkpoints keep phase-2 behavior.
const regionalActive=s=>s?.cfg?.mechanicsVersion===1;
function regionalValidSave(s){
 const h=s?.hazards,cell=n=>Number.isInteger(n)&&n>=0&&n<16;
 if(!regionalActive(s)||h?.version!==1||!Number.isSafeInteger(h.clock)||h.clock<0||![1,2].includes(h.bossPhase)||typeof h.pendingPhase!=='boolean'||!Number.isSafeInteger(h.nextUid)||h.nextUid<1||!h.stats||!Array.isArray(h.crystals)||h.crystals.length>3)return false;
 if(s.cfg.contentVersion===1&&((h.crystalPeriod!==undefined&&![2,3,4].includes(h.crystalPeriod))||(h.nextCrystalClock!==undefined&&(!Number.isSafeInteger(h.nextCrystalClock)||h.nextCrystalClock<h.clock))))return false;
 const walls=new Set();for(const c of h.crystals){if(!cell(c.cell)||walls.has(c.cell)||s.board[c.cell]||![1,2].includes(c.layers))return false;walls.add(c.cell);}
 if(h.warning&&(!cell(h.warning.cell)||!Number.isSafeInteger(h.warning.dueMove)))return false;
 const ids=new Set();for(const t of s.board)if(t){if(!Number.isSafeInteger(t.uid)||t.uid<1||ids.has(t.uid))return false;ids.add(t.uid);if(t.crack&&(!Array.from({length:s.cfg.contentVersion===1?4:3},(_,i)=>i+1).includes(t.crack.remaining)||!Number.isSafeInteger(t.crack.bornMove)))return false;}
 return !s.poison||[1,2,3].includes(s.poison.stacks)&&[1,2,3].includes(s.poison.remaining)&&Number.isSafeInteger(s.poison.bornMove);
}
function regionalState(s){return s.hazards??={version:1,clock:0,crystals:[],warning:null,bossPhase:1,pendingPhase:false,nextUid:1,stats:{crystalsPlaced:0,crystalsBroken:0,cracksApplied:0,cracksSaved:0,cracksExpired:0,neutralClears:0}};}
const regionalBoss=s=>!!ACT_ENEMIES[s.enemy]?.boss;
let regionalIntro=s=>s.enemy.endsWith('_intro');
const regionalAct=s=>ACT_ENEMIES[s.enemy]?.act;
function regionalNeighbours(cell){return[cell%4?cell-1:null,cell%4<3?cell+1:null,cell>=4?cell-4:null,cell<12?cell+4:null].filter(x=>x!==null);}
function regionalCell(s,cell){return regionalActive(s)&&regionalState(s).crystals.some(c=>c.cell===cell);}
function regionalStamp(s){const h=regionalState(s);for(const t of s.board)if(t&&!t.uid){t.uid=h.nextUid++;t.bornMove=s.moves;}}
function regionalBoardOwner(board,context){if(regionalActive(context))return context;return typeof state!=='undefined'&&regionalActive(state)&&board.some(t=>t?.uid)?state:null;}
function regionalSlide(board,dir,rune,chain=false,roots=true,context=null,owner=context){
 const walls=new Set(regionalState(owner).crystals.map(c=>c.cell));
 // Each input tile participates in at most one ordinary merge and one extra link.
 const out=board.map(t=>t?{...t}:null),merges=[],merged=[],moves=[],hits=[],preparedMarks=[];
 for(let line=0;line<4;line++){
  const ids=Array.from({length:4},(_,j)=>dir==='left'?line*4+j:dir==='right'?line*4+3-j:dir==='up'?j*4+line:(3-j)*4+line);let segment=[],barrier=null;
  function flush(){const items=segment.filter(i=>board[i]).map(i=>({tile:{...board[i]},sources:[i],used:0}));const result=[];segment.forEach(i=>out[i]=null);
   function combine(last,item,cell,linked){const other={...item.tile},winner={...last.tile};const rescued=[winner,other].filter(t=>t.crack).map(t=>t.uid);const sourceIds=[...last.sources,...item.sources].map(i=>board[i]?.uid);const originTypes=[...(last.originTypes||[winner.t]),...(item.originTypes||[other.t])];last.originTypes=originTypes;delete last.tile.crack;last.tile.v=Math.min(2**30,last.tile.v*2);if(last.tile.t==='x'&&rune==='egg3')last.tile.awake=!!(winner.awake||other.t==='x'||last.tile.v>=64);else delete last.tile.awake;last.used=linked?2:1;last.sources.push(...item.sources);
    if(context){const a=autoState(context),mark=a.marks.find(m=>m.cell===cell);if(mark){if(mark.kind==='number')autoRaise(last.tile);if(['garden','blessing'].includes(mark.kind)){last.tile.t='x';last.tile.awake=mark.kind==='blessing'||!!last.tile.awake||last.tile.v>=64;}if(last.tile.t==='x'&&rune==='egg3'&&last.tile.v>=64)last.tile.awake=true;preparedMarks.push({...mark,merge:merges.length});mark.uses=(mark.uses??1)-1;if(mark.uses<=0)a.marks.splice(a.marks.indexOf(mark),1);}}
    merges.push({...last.tile,other:other.t,same:winner.t===other.t,cell,rescued,originTypes,sourceIds});merged.push(cell);}
   // First apply ordinary pairs. A separate pass grants one extra link per lineage.
   for(let k=0;k<items.length;k++){const item=items[k];if(items[k+1]?.tile.v===item.tile.v){combine(item,items[++k],segment[result.length],false);}result.push(item);}
   if(chain)for(let k=0;k<result.length-1;k++){const a=result[k],b=result[k+1];if(a.tile.v===b.tile.v&&(a.used===1||b.used===1)&&a.used<2&&b.used<2){combine(a,b,segment[k],true);result.splice(k+1,1);}}
   result.forEach((item,j)=>{out[segment[j]]={...item.tile};for(const from of item.sources)moves.push({from,to:segment[j]});});
   if(roots&&barrier!==null&&items.length){out[barrier].f=Math.max(0,board[barrier].f-1);hits.push(barrier);}segment=[];}
  for(const i of ids){if(walls.has(i)){flush();barrier=null;}else if(board[i]?.f){flush();barrier=i;}else segment.push(i);}flush();
 }
 return{board:out,merges,merged,moves,hits,preparedMarks:context?preparedMarks:null,changed:JSON.stringify(board)!==JSON.stringify(out)};
}
const beforeRegionalSlide=relicSlide,beforeRegionalPlainSlide=slide,beforeRegionalCanMove=canMove;
relicSlide=function(board,dir,rune,chain=false,roots=true,context=null){const s=regionalBoardOwner(board,context);return s?regionalSlide(board,dir,rune,chain,roots,context,s):beforeRegionalSlide(board,dir,rune,chain,roots,context);};
slide=function(board,dir,rune){const s=regionalBoardOwner(board);return s?regionalSlide(board,dir,rune,relicOwned(s,'chain'),true,null,s):beforeRegionalPlainSlide(board,dir,rune);};
function regionalCanMove(s){return DIRS.some(d=>regionalSlide(s.board,d,s.cfg.rune,relicOwned(s,'chain'),true,null,s).changed);}
canMove=function(board){const s=regionalBoardOwner(board);return s?regionalCanMove({...s,board}):beforeRegionalCanMove(board);};
const beforeRegionalSpawn=spawn;
spawn=function(s,random=Math.random){
 if(!regionalActive(s))return beforeRegionalSpawn(s,random);
 const empty=s.board.map((t,i)=>!t&&!regionalCell(s,i)?i:null).filter(i=>i!==null);if(!empty.length)return;
 const rs=relicState(s),tile=rs.nextRune||relicRune(s,random);s.board[empty[Math.floor(random()*empty.length)]]={...tile};rs.nextRune=relicRune(s,random);regionalStamp(s);
};
const beforeRegionalMark=autoMark;
autoMark=function(s,kind,random){if(!regionalActive(s))return beforeRegionalMark(s,kind,random);const a=autoState(s),used=new Set(a.marks.map(m=>m.cell)),available=Array.from({length:16},(_,i)=>i).filter(i=>!used.has(i)&&!regionalCell(s,i));if(!available.length)return;let cell;if(relicOwned(s,'markCompass'))cell=available.filter(i=>s.board[i]).sort((i,j)=>s.board[j].v-s.board[i].v||i-j)[0];cell??=available[Math.floor(random()*available.length)];a.marks.push({cell,kind,uses:relicOwned(s,'pin')?2:1,powerFactor:s.relicSkillFactor||1});};
function regionalPoisonFactor(s){return (100-10*(s.poison?.stacks||0))/100;}
function regionalPoison(s){s.poison={stacks:Math.min(typeof contentHas==='function'&&contentHas(s,'skyImmunity')?2:3,(s.poison?.stacks||0)+1),remaining:3,bornMove:s.moves};}
function regionalCleanse(s,r){if(!s.poison)return;const heals=r.merges.reduce((n,t,i)=>n+((t.originTypes||[t.t,t.other]).includes('h')&&(t.t==='h'||relicOwned(s,'unity')&&!r.preparedMarks?.some(m=>m.merge===i))?1:0),0);s.poison.stacks=Math.max(0,s.poison.stacks-heals*(typeof contentHas==='function'&&contentHas(s,'skyDew')?2:1));if(!s.poison.stacks)delete s.poison;}
function regionalPhaseCheck(s){const h=regionalState(s);if(regionalBoss(s)&&h.bossPhase===1&&!h.pendingPhase&&s.enemyHp>0&&s.enemyHp<=s.cfg.enemyHp*.5){h.pendingPhase=true;log(s,'ผู้พิทักษ์เตรียมเปลี่ยนเฟส · เริ่มปัดถัดไป');}}
const beforeRegionalHit=relicHit;
relicHit=function(s,power,bypass=false,carry=true){if(!regionalActive(s))return beforeRegionalHit(s,power,bypass,carry);const count=s.regionalDamageCount??regionalState(s).crystals.length,guard=['cave_guard','cave_guardian'].includes(s.enemy)?100-(typeof contentCrystalRate==='function'?contentCrystalRate(s):10)*Math.min(3,count):100,poison=s.regionalReflection||(typeof contentHas==='function'&&contentHas(s,'poisonAwaken'))?100:100-10*(s.poison?.stacks||0);const damage=beforeRegionalHit(s,power*guard*poison/10000,bypass,carry);regionalPhaseCheck(s);return damage;};
// Reduce new armor at emission (including Auto grants), never stored buffs or retained armor.
// The temporary accessor is removed before a checkpoint is taken.
const regionalArmorScopes=new WeakMap();
function regionalArmorScope(s,action){if(!regionalActive(s)||regionalArmorScopes.has(s))return action();let armor=s.armor;regionalArmorScopes.set(s,true);Object.defineProperty(s,'armor',{configurable:true,enumerable:true,get:()=>armor,set:n=>{armor=n>armor?armor+Math.floor((n-armor)*regionalPoisonFactor(s)):n;}});try{return action();}finally{Object.defineProperty(s,'armor',{configurable:true,enumerable:true,writable:true,value:armor});regionalArmorScopes.delete(s);}}
const beforeRegionalHeal=relicHeal;
relicHeal=function(s,...args){return regionalArmorScope(s,()=>beforeRegionalHeal(s,...args));};
const beforeRegionalEnemyDamage=enemyDamage;
enemyDamage=function(s){const base=beforeRegionalEnemyDamage(s);return regionalActive(s)&&['cave_heavy','cave_guardian'].includes(s.enemy)?Math.ceil(base*(1+(typeof contentCrystalRate==='function'?contentCrystalRate(s):10)/100*Math.min(3,regionalState(s).crystals.length))):base;};
const beforeRegionalMerges=relicMerges;
relicMerges=function(s,r,dir,source,random,periodic){
 if(!regionalActive(s))return beforeRegionalMerges(s,r,dir,source,random,periodic);
 regionalCleanse(s,r);const h=regionalState(s);s.regionalDamageCount=h.crystals.length;
 try{regionalArmorScope(s,()=>beforeRegionalMerges(s,r,dir,source,random,periodic));}finally{delete s.regionalDamageCount;}
 const saved=new Set(r.merges.flatMap(t=>t.rescued||[]));h.stats.cracksSaved+=saved.size;
 for(const c of h.crystals){if(c.hitMove===s.moves||!r.merges.some(t=>regionalNeighbours(t.cell).includes(c.cell)))continue;c.layers--;c.hitMove=s.moves;}
 const broken=h.crystals.filter(c=>c.layers<=0);h.stats.crystalsBroken+=broken.length;h.crystals=h.crystals.filter(c=>c.layers>0);
 if(typeof contentAfterMerges==='function')contentAfterMerges(s,r,source,random,saved,broken);
 if(broken.length)log(s,'ทุบผลึกแตก '+broken.length+' ก้อน');if(saved.size)log(s,'ช่วยรูนร้าว '+saved.size+' ก้อน');
};
function regionalNeutral(s){const h=regionalState(s);h.crystals=[];h.warning=null;for(const t of s.board)if(t)delete t.crack;h.stats.neutralClears++;}
function regionalRecover(s){
 if(regionalCanMove(s))return;
 if(relicOwned(s,'explosion')&&!relicState(s).exploded&&s.hp>0){relicState(s).exploded=true;const ids=s.board.map((t,i)=>t?i:null).filter(i=>i!==null).sort((a,b)=>s.board[b].v-s.board[a].v||a-b),totals={a:0,d:0,h:0};for(const i of ids){const e=relicOutput(s,s.board[i],.4,1,false);for(const k of ['a','d','h'])totals[k]+=e[k];}relicHit(s,totals.a);s.armor=relicSafe(s.armor+totals.d);relicHeal(s,totals.h);for(const i of ids.slice(2))s.board[i]=null;regionalNeutral(s);log(s,'ระเบิดผลึก · ล้างสิ่งกีดขวางโดยไม่รับรางวัล');finish(s);if(s.status!=='playing'||regionalCanMove(s))return;}
 const ids=s.board.map((t,i)=>t?i:null).filter(i=>i!==null).sort((a,b)=>s.board[a].v-s.board[b].v||a-b);s.hp=Math.max(0,s.hp-Math.ceil(s.cfg.hp*.25));ids.slice(0,Math.ceil(ids.length/2)).forEach(i=>s.board[i]=null);regionalNeutral(s);log(s,'กระดานตัน · HP −25% ล้างรูนเล็กและสิ่งกีดขวาง');finish(s);
 // A board with only rooted survivors (or no surviving runes) still needs a legal move.
 if(s.status==='playing'&&!regionalCanMove(s)){const rooted=s.board.find(t=>t?.f);if(rooted)rooted.f=0;else if(!s.board.some(Boolean))spawn(s,rng);}
 if(s.status==='playing'&&!regionalCanMove(s))throw Error('กระดานยังตันหลังแก้ไข');
}
const beforeRegionalRecover=recover;
recover=function(s){return regionalActive(s)?regionalArmorScope(s,()=>regionalRecover(s)):beforeRegionalRecover(s);};
function regionalCrystalTarget(s,random){
 const h=regionalState(s),candidates=s.board.map((t,i)=>!t&&!regionalCell(s,i)&&regionalNeighbours(i).some(j=>s.board[j])?i:null).filter(i=>i!==null).filter(cell=>regionalCanMove({...s,hazards:{...h,crystals:[...h.crystals,{cell,layers:2}]}}));
 return candidates.length?candidates[Math.floor(random()*candidates.length)]:null;
}
function regionalEnd(s,random){
 const h=regionalState(s);if(s.poison&&s.poison.bornMove<s.moves&&--s.poison.remaining<=0)delete s.poison;
 const expired=[];for(let i=0;i<16;i++){const t=s.board[i];if(t?.crack&&t.crack.bornMove<s.moves&&--t.crack.remaining<=0){expired.push(t.uid);s.board[i]=null;}}
 if(expired.length){h.stats.cracksExpired+=expired.length;if(['sky_heavy','sky_guardian'].includes(s.enemy))s.armor=0;if(['sky_haste','sky_guardian'].includes(s.enemy))s.countdown=Math.max(1,s.countdown-1);if(['sky_poison','sky_guardian'].includes(s.enemy))regionalPoison(s);if(typeof contentAfterExpired==='function')contentAfterExpired(s,expired.length);log(s,'รูนร้าวแตก '+expired.length+' ก้อน');}
 h.clock++;const boss=regionalBoss(s),basePeriod=boss?(h.bossPhase===2?2:3):4,period=typeof contentPeriod==='function'?contentPeriod(s,basePeriod):basePeriod,cap=boss?3:2;
 if(!regionalIntro(s)&&regionalAct(s)===2){
  if(typeof contentActive==='function'&&contentActive(s))contentCrystalTurn(s,random,period,cap);else{
  if(h.clock%period===0){const cell=h.warning?.cell;h.warning=null;if(cell!==undefined&&cell!==null&&!s.board[cell]&&!regionalCell(s,cell)&&h.crystals.length<cap&&regionalNeighbours(cell).some(i=>s.board[i])&&regionalCanMove({...s,hazards:{...h,crystals:[...h.crystals,{cell,layers:2}]}})){h.crystals.push({cell,layers:2});h.stats.crystalsPlaced++;log(s,'ผลึกเกิด 2 ชั้น');}}
  if(h.clock%period===period-1&&h.crystals.length<cap){const cell=regionalCrystalTarget(s,random);h.warning=cell===null?null:{cell,dueMove:s.moves+1};}
 }}
 if(!regionalIntro(s)&&regionalAct(s)===3&&h.clock%period===0){
  const candidates=s.board.filter(t=>t&&!t.crack&&t.bornMove<s.moves&&s.board.some(other=>other&&other.uid!==t.uid&&other.v===t.v));if(s.board.filter(t=>t?.crack).length<cap&&candidates.length){const t=candidates[Math.floor(random()*candidates.length)];t.crack={remaining:typeof contentLifetime==='function'?contentLifetime(s):3,bornMove:s.moves};h.stats.cracksApplied++;log(s,'รูนร้าว · รวมช่วยภายใน '+t.crack.remaining+' ปัด');}
 }
 regionalRecover(s);
}

function regionalSwipe(s,dir,random){
 if(s.status!=='playing'||!DIRS.includes(dir))return false;
 if(!regionalSlide(s.board,dir,s.cfg.rune,relicOwned(s,'chain'),true,null,s).changed){s.feedback='กระดานไม่เปลี่ยน · ไม่เสียเทิร์น';return false;}
 const h=regionalState(s);if(h.pendingPhase){h.pendingPhase=false;h.bossPhase=2;h.clock=0;h.warning=null;if(typeof contentActive==='function'&&contentActive(s)){delete h.crystalPeriod;delete h.nextCrystalClock;}log(s,'ผู้พิทักษ์เข้าสู่เฟส 2');}
 return regionalArmorScope(s,()=>{
 const own=id=>relicOwned(s,id),rs=relicState(s),r=regionalSlide(s.board,dir,s.cfg.rune,own('chain'),true,s,s);
 if(!s.started)s.started=Date.now();s.board=r.board;s.moves++;s.lastAttack=null;if(s.cfg.skillVersion)autoTick(s);const periodic=runeTick(s);s.charge=Math.min(s.cfg.cooldown,s.charge+1);relicMerges(s,r,dir,'swipe',random,periodic);if(own('echo'))rs.echo=r.merges.length===0;if(s.cfg.skillVersion)autoAge(s);if(finish(s))return true;
 spawn(s,random);if(own('twins'))spawn(s,random);if(s.cfg.skillVersion){autoCast(s,random);regionalStamp(s);if(finish(s))return true;}
 s.countdown--;if(s.countdown<=0){const wasHeavy=s.heavy,power=s.cfg.skillVersion?autoReduction(s,enemyDamage(s)):enemyDamage(s),blocked=Math.min(s.armor,power),damage=power-blocked,remains=Math.max(0,s.armor-power);s.lastAttack={power,blocked,damage};s.armor=own('retention')?Math.floor(remains*.5):0;s.hp=Math.max(0,s.hp-damage);s.countdown=s.cfg.interval;rs.hourglass=false;
 if(own('wound')&&damage>0)s.charge=Math.min(s.cfg.cooldown,s.charge+1);if(finish(s))return true;
 if(own('thorn')&&damage===0){s.regionalReflection=true;try{relicHit(s,power,true);}finally{delete s.regionalReflection;}if(finish(s))return true;}
 if(s.cfg.skillVersion){autoAfterAttack(s);if(finish(s))return true;}relicHit(s,runeCounter(s));if(finish(s))return true;
 if(own('pulse')){const ids=autoTargets(s,()=>true,16);if(ids.length){const e=relicOutput(s,s.board[ids.at(-1)],.3,1,false);relicHit(s,e.a);s.armor=relicSafe(s.armor+e.d);relicHeal(s,e.h);if(finish(s))return true;}}
 if(s.enemy==='stag'){const ids=s.board.map((t,i)=>t&&!t.f?i:null).filter(i=>i!==null);for(let n=0;n<(h.bossPhase===2?3:2)&&ids.length;n++)s.board[ids.splice(Math.floor(random()*ids.length),1)[0]].f=own('root')?1:2;}
 if(s.enemy==='cave_healer'&&s.enemyHp>0)s.enemyHp=Math.min(s.cfg.enemyHp,s.enemyHp+Math.floor(s.cfg.enemyHp*.02*Math.min(3,h.crystals.length)*(typeof contentCrystalRate==='function'?contentCrystalRate(s)/10:1)));
 if(wasHeavy&&rs.interruptLocked)rs.interruptLocked=false;s.heavy=!s.heavy;if(own('wind'))rs.direction=DIRS[Math.floor(random()*4)];
 if(own('gravity')){const g=regionalSlide(s.board,'down',s.cfg.rune,own('chain'),false,s,s);s.board=g.board;relicMerges(s,g,'down','gravity',random);if(finish(s))return true;}
 }
 regionalEnd(s,random);regionalPhaseCheck(s);return true;
 });
}
const beforeRegionalSwipe=relicSwipe;
relicSwipe=function(s,dir,random=Math.random){return regionalActive(s)?regionalSwipe(s,dir,random):beforeRegionalSwipe(s,dir,random);};
const beforeRegionalFinish=finish;
finish=function(s){const done=beforeRegionalFinish(s);if(regionalActive(s)&&s.status==='won'){for(const t of s.board)if(t){t.f=0;delete t.crack;}regionalState(s).crystals=[];regionalState(s).warning=null;delete s.poison;}return done;};
const beforeRegionalEnter=enterBattle;
enterBattle=function(enemy){beforeRegionalEnter(enemy);if(!regionalActive(state))return;regionalStamp(state);persist();};
const beforeRegionalCast=autoCast;
autoCast=function(s,random=Math.random){return regionalArmorScope(s,()=>{const result=beforeRegionalCast(s,random);if(regionalActive(s))regionalStamp(s);return result;});};
const beforeRegionalAnswer=answer;
answer=function(index){if(regionalActive(state)&&run.phase==='reviveQuiz'&&run.quiz.index===2&&run.quiz.correct===2&&index===questionBank()[run.quiz.ids[2]][2]&&!regionalCanMove(state))regionalNeutral(state);return beforeRegionalAnswer(index);};
const beforeRegionalSettle=settleRun;
settleRun=function(){const stats=regionalActive(state)&&run.phase==='battle'&&state.status==='won'?structuredClone(regionalState(state).stats):null;beforeRegionalSettle();if(stats){const record=run.history.at(-1);if(record?.battle)record.mechanics=stats;persist();}};
