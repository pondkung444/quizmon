'use strict';
// New journeys use the medium experiment. Legacy eight-room saves keep their rules.
ENEMY.slow_striker={name:'ผลึกหนัก',hp:150,damage:22,interval:4};
ENEMY.glass_striker={name:'ผลึกฉับไว',hp:60,damage:18,interval:2};
DOOR_ART.slow_striker='crystal-heavy-v1.webp';
DOOR_ART.glass_striker='crystal-swift-v1.webp';
DOOR_KIND.slow_striker=DOOR_KIND.glass_striker='ต่อสู้';
DOORS.slow_striker=['ผลึกหนัก','HP 150 · ตี 22 ทุก 4 ปัด'];
DOORS.glass_striker=['ผลึกฉับไว','HP 60 · ตี 18 ทุก 2 ปัด'];
const isEndless=()=>run?.endlessVersion===1;
// Only new v4 journeys receive the pilot's gentler opening. Existing checkpoints replay v3 exactly.
const gentleOpening=()=>isEndless()&&run.balanceVersion>=4;
function openingRecovery(){if(!gentleOpening()||run.room>3)return;const heal=Math.min(state.cfg.hp-state.hp,Math.ceil(state.cfg.hp*.20));state.hp+=heal;if(heal)log(state,`พักหลังการต่อสู้ · HP +${heal}`);}
let localRoom=room=>1+(room-1)%8;
let enemyLevel=room=>1+Math.floor((room-1)/8);
function endlessStat(base,growth,level){return Math.min(Number.MAX_SAFE_INTEGER,Math.round(base*growth**(level-1)));}
// Same independent route stream as the simulator; no precomputed room limit.
function endlessDoors(room){
 const normal=['mushroom','beetle','slow_striker','glass_striker'];
 let a=((run.routeSeed^0xA17E2048)>>>0);
 const routeRng=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
 const pick=items=>items[Math.floor(routeRng()*items.length)];
 let options;
 for(let n=2;n<=room;n++){
  const local=localRoom(n);
  if(local===4)options=['brute'];else if(local===8)options=['stag'];
  else if(n===2)options=['mushroom','beetle'];
  else{const pool=gentleOpening()&&n===3?['mushroom','beetle']:local<=3?normal:[...normal,'rest','shop','quiz'];const first=pick(pool);options=[first,pick(pool.filter(t=>t!==first))];}
  pick(options); // Simulator's choice draw; human chooses either offered door.
 }
 return options;
}
const legacyHas=has;
has=function(id){return isEndless()?false:legacyHas(id);};
const legacyOffers=offers;
offers=function(n=3){return isEndless()?[]:legacyOffers(n);};
const legacyEnterBattle=enterBattle;
enterBattle=function(enemy){
 legacyEnterBattle(enemy);
 if(!isEndless())return;
 const local=localRoom(run.room),level=enemyLevel(run.room),base=ENEMY[enemy];
 const damage=run.room<=(gentleOpening()?3:2)?({mushroom:10,beetle:13}[enemy]??base.damage):gentleOpening()&&run.room===4&&enemy==='brute'?18:base.damage;
 state.cfg.damage=endlessStat(damage,1.08,level);
 state.cfg.enemyHp=endlessStat((gentleOpening()&&run.room===4&&enemy==='brute'?150:base.hp)+(local>4&&enemy!=='stag'?20:0),1.20,level);
 state.enemyHp=state.cfg.enemyHp;
 state.cfg.relicSpark=state.cfg.relicShadow=state.cfg.relicSeed=false;
 render();persist();
};
const legacyMakeDoors=makeDoors;
makeDoors=function(){if(!isEndless())return legacyMakeDoors();run.phase='doors';run.doors=endlessDoors(run.room+1);};
const legacySettleRun=settleRun;
settleRun=function(){
 if(!isEndless()||state.status!=='won')return legacySettleRun();
 if(run.phase!=='battle')return;
 run.coins+=localRoom(run.room)===4?45:20;
 run.history.push({room:run.room,type:state.enemy,moves:state.moves,hp:state.hp});
 makeDoors();persist();showPhase();
};
const legacyChooseRelic=chooseRelic;
chooseRelic=function(id){if(!isEndless())return legacyChooseRelic(id);};
const legacyRunHUD=runHUD;
runHUD=function(){
 if(!isEndless())return legacyRunHUD();
 document.querySelector('#run-hud').textContent=`เลเวล ${enemyLevel(run.room)} · ห้อง ${localRoom(run.room)}/8 · ระยะทาง ${run.room} · ช่วยชีวิต ${run.revived?'ใช้แล้ว':'เหลือ 1 ครั้ง'}`;
 document.querySelector('#relics').textContent='Endless · พาคู่หูไปให้ไกลที่สุด';
};
const legacyShowPhase=showPhase;
showPhase=function(){
 if(!isEndless())return legacyShowPhase();
 runHUD();
 if(run.phase==='shop')return panel('ร้านนักเดินทาง','ร้านยังไม่มีสินค้าในรอบสำรวจนี้',[{title:'เดินทางต่อ',action:completeUtility}]);
 if(run.phase==='quizReward')return panel(run.quizPassed?'ศิลาส่องแสงตอบรับ':'ได้เรียนรู้อีกหนึ่งเรื่อง','เดินทางต่อด้วยกัน',[{title:'เดินทางต่อ',action:()=>{if(run.phase!=='quizReward')return;if(run.quizPassed)run.coins+=25;completeUtility();}}]);
 if(run.phase==='relic'){makeDoors();persist();return showPhase();}
 if(run.phase==='failed')return panel('เราจะกลับมาสำรวจด้วยกันอีก',`ถึงเลเวล ${enemyLevel(run.room)} ห้อง ${localRoom(run.room)}/8 · ระยะทาง ${run.room} ห้อง · ผ่าน ${run.history.length} ห้อง · ${Math.floor((Date.now()-run.started)/60000)} นาที`,[{title:'เริ่มการเดินทางใหม่',action:showNewRun}]);
 if(run.phase==='doors')return panel(`เลือกเส้นทาง · เลเวล ${enemyLevel(run.room+1)} ห้อง ${localRoom(run.room+1)}/8`,`HP ${state.hp}/${state.cfg.hp} · เข้าสู้ล้างรูนต่ำสุดครึ่งหนึ่งและคลายราก · เกราะเริ่ม 0`,run.doors.map(type=>({title:DOORS[type][0],desc:type==='brute'?'ศัตรูแกร่ง · หมัดหนักสลับหมัดปกติ':type==='stag'?'บอสประจำเลเวล · พันรากรูน ชน 2 ครั้งเพื่อคลาย':type==='quiz'?'ตอบหนึ่งข้อ · ตอบผิดไม่มีโทษ':type==='shop'?'ยังไม่มีสินค้า · ใช้หนึ่งห้อง':DOORS[type][1].replace(' · ชนะรับ 20 เหรียญ',''),art:DOOR_ART[type],kind:DOOR_KIND[type],action:()=>enterDoor(type)})));
 return legacyShowPhase();
};
