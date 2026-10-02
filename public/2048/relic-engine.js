'use strict';
const relicSafe=n=>Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER));
function relicHeal(s,power,overflow=false){const n=Math.floor(relicSafe(power)),heal=Math.min(s.cfg.hp-s.hp,n);s.hp+=heal;if(overflow||relicOwned(s,'overflow'))s.armor=relicSafe(s.armor+n-heal);}
function relicHit(s,power,bypass=false,carry=true){let damage=Math.floor(relicSafe(power));if(relicOwned(s,'weakness')&&s.heavy)damage=Math.floor(relicSafe(damage*1.5));if(!bypass&&s.enemy==='beetle'&&!s.heavy)damage=Math.ceil(damage/2);if(carry&&relicOwned(s,'pierce')&&damage>s.enemyHp&&s.enemyHp>0)run.relicCarry=damage-s.enemyHp;s.enemyHp=Math.max(0,s.enemyHp-damage);return damage;}
function relicRune(s,rng){return{v:relicOwned(s,'twins')?2:rng()<(relicOwned(s,'seed')?.35:.1)?4:2,t:(EGG_RUNES[s.cfg.rune]?['a','d','h','x']:['a','d','h'])[Math.floor(rng()*(EGG_RUNES[s.cfg.rune]?4:3))],f:0};}
const preRelicSpawn=spawn;
spawn=function(s,rng=Math.random){if(s.cfg.relicVersion!==1)return preRelicSpawn(s,rng);const empty=s.board.map((t,i)=>t?null:i).filter(i=>i!==null);if(!empty.length)return;const rs=relicState(s);const tile=rs.nextRune||relicRune(s,rng);s.board[empty[Math.floor(rng()*empty.length)]]={...tile};rs.nextRune=relicRune(s,rng);};
function relicSlide(board,dir,rune,chain=false,roots=true,context=null){
 // Each input tile participates in at most one ordinary merge and one extra link.
 const out=board.map(t=>t?{...t}:null),merges=[],merged=[],moves=[],hits=[],preparedMarks=[];
 for(let line=0;line<4;line++){
  const ids=Array.from({length:4},(_,j)=>dir==='left'?line*4+j:dir==='right'?line*4+3-j:dir==='up'?j*4+line:(3-j)*4+line);let segment=[],barrier=null;
  function flush(){const items=segment.filter(i=>board[i]).map(i=>({tile:{...board[i]},sources:[i],used:0}));const result=[];segment.forEach(i=>out[i]=null);
   function combine(last,item,cell,linked){const other={...item.tile},winner={...last.tile};last.tile.v=Math.min(2**30,last.tile.v*2);if(last.tile.t==='x'&&rune==='egg3')last.tile.awake=!!(winner.awake||other.t==='x'||last.tile.v>=64);else delete last.tile.awake;last.used=linked?2:1;last.sources.push(...item.sources);
    if(context){const a=autoState(context),mark=a.marks.find(m=>m.cell===cell);if(mark){if(mark.kind==='number')autoRaise(last.tile);if(['garden','blessing'].includes(mark.kind)){last.tile.t='x';last.tile.awake=mark.kind==='blessing'||!!last.tile.awake||last.tile.v>=64;}if(last.tile.t==='x'&&rune==='egg3'&&last.tile.v>=64)last.tile.awake=true;preparedMarks.push({...mark,merge:merges.length});mark.uses=(mark.uses??1)-1;if(mark.uses<=0)a.marks.splice(a.marks.indexOf(mark),1);}}
    merges.push({...last.tile,other:other.t,same:winner.t===other.t,cell});merged.push(cell);}
   // First apply ordinary pairs. A separate pass grants one extra link per lineage.
   for(let k=0;k<items.length;k++){const item=items[k];if(items[k+1]?.tile.v===item.tile.v){combine(item,items[++k],segment[result.length],false);}result.push(item);}
   if(chain)for(let k=0;k<result.length-1;k++){const a=result[k],b=result[k+1];if(a.tile.v===b.tile.v&&(a.used===1||b.used===1)&&a.used<2&&b.used<2){combine(a,b,segment[k],true);result.splice(k+1,1);}}
   result.forEach((item,j)=>{out[segment[j]]={...item.tile};for(const from of item.sources)moves.push({from,to:segment[j]});});
   if(roots&&barrier!==null&&items.length){out[barrier].f=Math.max(0,board[barrier].f-1);hits.push(barrier);}segment=[];}
  for(const i of ids){if(board[i]?.f){flush();barrier=i;}else segment.push(i);}flush();
 }
 return{board:out,merges,merged,moves,hits,preparedMarks:context?preparedMarks:null,changed:JSON.stringify(board)!==JSON.stringify(out)};
}
function relicFactor(s,t,dir,source,combo){let bonus=0;const own=id=>relicOwned(s,id),rs=relicState(s);if(source==='swipe'||source==='gravity'){
 if(own('corner')&&[0,3,12,15].includes(t.cell))bonus+=.5;if(own('wind')&&dir===rs.direction)bonus+=.5;if(own('blood')&&t.same)bonus+=.4;
 if(own('drum'))bonus+=.4;if(own('heavyCoin'))bonus+=Math.min(.5,run.coins*.01);if(own('crown'))bonus+=(run.crownWins||0)*.2;
 if(source==='swipe'&&own('echo')&&rs.echo)bonus+=.5;if(source==='swipe'&&own('timing')&&s.countdown===1)bonus+=1;
 }return relicSafe((1+bonus)*combo);}
function relicOutput(s,t,factor=1,critical=1,units=true){if(t.t==='x'){const r=runeState(s),cold=r.cold,spark=r.spark;const out=runeMerge(s,t,factor,critical);if(!units){r.cold=cold;r.spark=spark;}return out;}const p=runePower(s,t.v,factor);return{a:t.t==='a'?Math.floor(p.a*critical):0,d:t.t==='d'?Math.floor(p.d):0,h:t.t==='h'?Math.floor(p.h):0};}
function relicMerges(s,r,dir,source,rng,periodic={burn:0,heal:0}){const own=id=>relicOwned(s,id),combo=source==='swipe'?1+s.cfg.bonus*Math.max(0,r.merges.length-1):1;const marks=r.preparedMarks??(s.cfg.skillVersion?autoPrepareMerges(s,r):[]);const crit=source==='swipe'&&r.merges.some(t=>t.t==='a'||t.t==='x'&&['egg1','egg3','egg5'].includes(s.cfg.rune))&&(s.cfg.critChance||0)>0&&rng()<s.cfg.critChance;s.lastCrit=crit;const totals={a:periodic.burn,d:0,h:periodic.heal};
 // Snapshot thresholds before processing simultaneous merges; stable board traversal.
 const crisis=s.hp<s.cfg.hp*.35,shieldReady=s.armor>enemyDamage(s);
 r.merges.forEach((t,i)=>{const factor=relicFactor(s,t,dir,source,combo),mark=marks.find(m=>m.merge===i),mixed=own('unity')&&t.other!==t.t&&!mark;const parts=mixed?[{...t},{...t,t:t.other}]:[t];
 for(const part of parts){const e=relicOutput(s,part,factor*(mixed?.6:1),crit?(s.cfg.critMultiplier||1.5):1);for(const key of ['a','d','h'])totals[key]+=e[key];}
 const p=runePower(s,t.v,factor);if(own('crisis')&&crisis)totals.a+=Math.floor(p.a*.5);if(own('shieldStrike')&&shieldReady&&t.t==='d')totals.a+=Math.floor(p.d*.5);
 });
 relicHit(s,totals.a);s.armor=relicSafe(s.armor+totals.d);relicHeal(s,totals.h);
 if(s.cfg.skillVersion){r.merges.forEach((t,i)=>autoMergeEffects(s,t,i,marks));autoPostMerges(s,marks);}
 // Gravity may collect stored elemental units once; pulse/explosion never call this.
 const elemental=r.merges.map((t,i)=>t.t==='x'||own('unity')&&t.other==='x'&&!marks.some(m=>m.merge===i)?{t:'x'}:t);runeAfterMerges(s,elemental);
 if(source==='swipe'){s.maxCombo=Math.max(s.maxCombo,r.merges.length);if(own('spark')&&r.merges.length>=2)s.charge=Math.min(s.cfg.cooldown,s.charge+1);if(own('hourglass')&&!relicState(s).hourglass&&r.merges.length>=3){s.countdown++;relicState(s).hourglass=true;}}
 s.relicCombo=combo;log(s,`#${s.moves} รวม ${r.merges.length} คู่ · ⚔ ${totals.a} 🛡 +${totals.d} ✚ +${totals.h}`);
}
const preRelicRecover=recover;
recover=function(s){if(s.cfg.relicVersion!==1||!relicOwned(s,'explosion')||relicState(s).exploded||s.hp<=0||canMove(s.board))return preRelicRecover(s);relicState(s).exploded=true;const ids=s.board.map((t,i)=>t?i:null).filter(i=>i!==null).sort((a,b)=>s.board[b].v-s.board[a].v||a-b);const totals={a:0,d:0,h:0};for(const i of ids){const e=relicOutput(s,s.board[i],.4,1,false);for(const k of ['a','d','h'])totals[k]+=e[k];}relicHit(s,totals.a);s.armor=relicSafe(s.armor+totals.d);relicHeal(s,totals.h);for(const i of ids.slice(2))s.board[i]=null;log(s,'💥 ระเบิดผลึก · เหลือรูนใหญ่สุด 2 ช่อง');finish(s);};
function relicSwipe(s,dir,rng=Math.random){if(s.status!=='playing'||!DIRS.includes(dir))return false;const own=id=>relicOwned(s,id),rs=relicState(s);if(!relicSlide(s.board,dir,s.cfg.rune,own('chain')).changed){s.feedback='กระดานไม่เปลี่ยน · ไม่เสียเทิร์น';return false;}const r=relicSlide(s.board,dir,s.cfg.rune,own('chain'),true,s);
 if(!s.started)s.started=Date.now();s.board=r.board;s.moves++;s.lastAttack=null;if(s.cfg.skillVersion)autoTick(s);const periodic=runeTick(s);s.charge=Math.min(s.cfg.cooldown,s.charge+1);relicMerges(s,r,dir,'swipe',rng,periodic);if(own('echo'))rs.echo=r.merges.length===0;if(s.cfg.skillVersion)autoAge(s);if(finish(s))return true;
 spawn(s,rng);if(own('twins'))spawn(s,rng);if(s.cfg.skillVersion){autoCast(s,rng);if(finish(s))return true;}
 s.countdown--;if(s.countdown<=0){const wasHeavy=s.heavy,power=s.cfg.skillVersion?autoReduction(s,enemyDamage(s)):enemyDamage(s),blocked=Math.min(s.armor,power),damage=power-blocked;const remains=Math.max(0,s.armor-power);s.lastAttack={power,blocked,damage};s.armor=own('retention')?Math.floor(remains*.5):0;s.hp=Math.max(0,s.hp-damage);s.countdown=s.cfg.interval;rs.hourglass=false;
 if(own('wound')&&damage>0)s.charge=Math.min(s.cfg.cooldown,s.charge+1);if(finish(s))return true;
 if(own('thorn')&&damage===0){relicHit(s,power,true);if(finish(s))return true;}if(s.cfg.skillVersion){autoAfterAttack(s);if(finish(s))return true;}relicHit(s,runeCounter(s));if(finish(s))return true;
 if(own('pulse')){const ids=autoTargets(s,()=>true,16);if(ids.length){const e=relicOutput(s,s.board[ids.at(-1)],.3,1,false);relicHit(s,e.a);s.armor=relicSafe(s.armor+e.d);relicHeal(s,e.h);if(finish(s))return true;}}
 if(s.enemy==='stag'){let ids=s.board.map((t,i)=>t&&!t.f?i:null).filter(i=>i!==null);for(let n=0;n<2&&ids.length;n++){const j=Math.floor(rng()*ids.length);s.board[ids.splice(j,1)[0]].f=own('root')?1:2;}}
 if(wasHeavy&&rs.interruptLocked)rs.interruptLocked=false;s.heavy=!s.heavy;if(own('wind'))rs.direction=DIRS[Math.floor(rng()*4)];
 if(own('gravity')){const g=relicSlide(s.board,'down',s.cfg.rune,own('chain'),false,s);s.board=g.board;relicMerges(s,g,'down','gravity',rng);if(finish(s))return true;}
 }recover(s);return true;
}
const preRelicAutoPower=autoPower;
autoPower=function(s,value=16){const p=preRelicAutoPower(s,value);if(s.cfg.relicVersion!==1)return p;const factor=s.relicSkillFactor||1;for(const k of ['a','d','h'])p[k]=relicSafe(p[k]*factor);return p;};
const preRelicAutoHit=autoHit;
autoHit=function(s,power){return s.cfg.relicVersion===1?relicHit(s,power):preRelicAutoHit(s,power);};
const preRelicAutoHeal=autoHeal;
autoHeal=function(s,power,overflow=false){return s.cfg.relicVersion===1?relicHeal(s,power,overflow):preRelicAutoHeal(s,power,overflow);};
const preRelicMark=autoMark;
autoMark=function(s,kind,rng){if(s.cfg.relicVersion!==1)return preRelicMark(s,kind,rng);const a=autoState(s),used=new Set(a.marks.map(m=>m.cell)),available=Array.from({length:16},(_,i)=>i).filter(i=>!used.has(i));if(!available.length)return;let cell;if(relicOwned(s,'markCompass')){const tiles=available.filter(i=>s.board[i]).sort((i,j)=>s.board[j].v-s.board[i].v||i-j);cell=tiles[0];}if(cell===undefined)cell=available[Math.floor(rng()*available.length)];a.marks.push({cell,kind,uses:relicOwned(s,'pin')?2:1,powerFactor:s.relicSkillFactor||1});};
const preRelicPrepare=autoPrepareMerges;
autoPrepareMerges=function(s,r){if(s.cfg.relicVersion!==1)return preRelicPrepare(s,r);const a=autoState(s),triggered=[];for(let j=0;j<r.merges.length;j++){const mark=a.marks.find(m=>m.cell===r.merged[j]);if(!mark)continue;const t=r.merges[j];if(mark.kind==='number'){autoRaise(t);if(t.t==='x'&&s.cfg.rune==='egg3'&&t.v>=64)t.awake=true;}if(['garden','blessing'].includes(mark.kind)){t.t='x';t.awake=mark.kind==='blessing'||!!s.board[mark.cell]?.awake||t.v>=64;}Object.assign(s.board[mark.cell],t);triggered.push({...mark,merge:j});mark.uses=(mark.uses??1)-1;if(mark.uses<=0)a.marks.splice(a.marks.indexOf(mark),1);}return triggered;};
const preRelicMergeEffects=autoMergeEffects;
autoMergeEffects=function(s,t,index,marks){if(s.cfg.relicVersion!==1)return preRelicMergeEffects(s,t,index,marks);const mark=marks.find(m=>m.merge===index),a=autoState(s),b=a.buffs,p=preRelicAutoPower(s,t.v);if(b.follow&&b.follow.quota>0&&(!b.follow.defensive||t.t==='d'||t.t==='x')){autoHit(s,b.follow.power);b.follow.quota--;}
 if(t.t==='x'&&b.water){const f=b.water.powerFactor||1;if(b.water.heal)autoHeal(s,p.h*.4*f,true);else autoHit(s,p.a*.4*f);}
 if(!mark)return;const f=mark.powerFactor||1;if(mark.kind==='charge')s.charge=Math.min(s.cfg.cooldown,s.charge+2);if(mark.kind==='arrow')autoHit(s,p.a*1.5*f);if(mark.kind==='guard')s.armor=relicSafe(s.armor+Math.floor(p.d*1.5*f));
 if(mark.kind==='double'){const view={...s,cfg:{...s.cfg,...s.cfg.skillBase}};const e=t.t==='x'?runeMerge(view,t,f,1):{a:t.t==='a'?p.a*f:0,d:t.t==='d'?p.d*f:0,h:t.t==='h'?p.h*f:0};autoHit(s,e.a);s.armor=relicSafe(s.armor+Math.floor(e.d));autoHeal(s,e.h);}
 if(mark.kind==='blessing'){autoHit(s,p.a*f);s.armor=relicSafe(s.armor+Math.floor(p.d*.7*f));autoHeal(s,p.h*.4*f);}
};
const preRelicAfterAttack=autoAfterAttack,preRelicSpark=autoSpark;
autoAfterAttack=function(s){if(s.cfg.relicVersion!==1)return preRelicAfterAttack(s);const b=autoState(s).buffs,p=preRelicAutoPower(s);if(b.counter){autoHit(s,b.counter.power);delete b.counter;}if(s.enemyHp>0&&b.rebuild){s.armor=relicSafe(s.armor+Math.floor(p.d*.3*(b.rebuild.powerFactor||1)));delete b.rebuild;}};
autoSpark=function(s){if(s.cfg.relicVersion!==1)return preRelicSpark(s);const b=autoState(s).buffs.spark;if(b&&b.quota>0){s.armor=relicSafe(s.armor+Math.floor(preRelicAutoPower(s).d*.6*(b.powerFactor||1)));b.quota--;}};
const preRelicCast=autoCast;
autoCast=function(s,rng=Math.random){if(s.cfg.relicVersion!==1)return preRelicCast(s,rng);const own=id=>relicOwned(s,id),rs=relicState(s);if(own('battery')&&s.countdown!==1)return false;
 const cast=()=>{s.relicSkillFactor=1+(own('battery')?.5:0);if(own('candle'))s.relicSkillFactor*=s.relicCombo||1;const old=s.heavy;if(own('interrupt')&&s.heavy&&!rs.interruptLocked){s.heavy=false;rs.interruptLocked=true;rs.cancelled=true;}
 const previous={...autoState(s).buffs};const ok=preRelicCast(s,rng);if(ok)for(const [key,b]of Object.entries(autoState(s).buffs))if(b!==previous[key])b.powerFactor=s.relicSkillFactor;s.armor=relicSafe(s.armor);delete s.relicSkillFactor;if(!ok){s.heavy=old;if(rs.cancelled){rs.interruptLocked=false;rs.cancelled=false;}return false;}rs.cancelled=false;
 if(own('growth')){const ids=autoTargets(s,()=>true,1);if(ids.length){autoRaise(s.board[ids[0]]);const t=s.board[ids[0]];if(t.t==='x'&&s.cfg.rune==='egg3'&&t.v>=64)t.awake=true;}}if(own('seal')&&s.status==='playing')autoMark(s,'charge',rng);return true;};
 if(!skillInfo(s)||s.status!=='playing'||s.charge<s.cfg.cooldown||s.enemyHp<=0)return false;if(!cast())return false;rs.autoCount=(rs.autoCount+1)%3;if(own('resonance')&&rs.autoCount===0&&s.status==='playing'){const pending=s.charge;s.charge=s.cfg.cooldown;cast();s.charge=Math.min(s.cfg.cooldown,s.charge+pending);}return true;
};
MARK_ICONS.charge='ϟ';
