'use strict';
// Versioned three-act journey. Legacy journeys keep their eight-room rules.
const ACT_JOURNEY_VERSION=1;
const ACTS=[
 {id:'forest',name:'ป่าผลึก',growth:1,boss:'stag',bossName:'กวางเทพพิทักษ์',bossTemplate:'stag',normal:['mushroom','beetle','slow_striker','glass_striker']},
 {id:'cave',name:'ถ้ำผลึก',growth:1.2,boss:'cave_guardian',bossName:'ผู้พิทักษ์ถ้ำผลึก',bossTemplate:'slow_striker',normal:['cave_light','cave_guard','cave_heavy','cave_healer']},
 {id:'sky',name:'ภูเขาลอยฟ้า',growth:1.44,boss:'sky_guardian',bossName:'ผู้พิทักษ์ฟ้า',bossTemplate:'glass_striker',normal:['sky_light','sky_haste','sky_heavy','sky_poison']}
];
const ACT_TEMPLATES=['mushroom','beetle','slow_striker','glass_striker'];
const ACT_ENEMIES={};
const ACT_RELIC_POOLS={cave:[],sky:[]}; // Registered by later mechanic/relic phases.
const isActJourney=()=>run?.journeyVersion===ACT_JOURNEY_VERSION;
const actNumber=room=>Math.floor((room-1)/10)+1;
const actLocalRoom=room=>(room-1)%10+1;
const actDefinition=room=>ACTS[actNumber(room)-1];
for(const [i,act]of ACTS.entries()){
 act.normal.forEach((id,j)=>{
  const template=ACT_TEMPLATES[j];
  if(i){ENEMY[id]={...ENEMY[template],name:[['ลูกผลึกถ้ำ','เกราะผลึก','ผลึกถ้ำหนัก','ผลึกฟื้นตัว'],['ปีกผลึกอ่อน','ปีกเร่งลม','ผลึกฟ้าหนัก','ปีกหมอกพิษ']][i-1][j]};DOOR_ART[id]=DOOR_ART[template];}
  ACT_ENEMIES[id]={template,act:i+1};
  if(i){DOOR_KIND[id]='ต่อสู้';DOORS[id]=[ENEMY[id].name,'ต่อสู้ประจำ'+act.name];}
 });
 const intro=act.id+'_intro';act.intro=intro;
 ENEMY[intro]={...ENEMY[act.normal[0]],hp:65,damage:10,interval:3,name:ENEMY[act.normal[0]].name+' · ตั้งตัว'};
 ACT_ENEMIES[intro]={template:'mushroom',act:i+1};DOOR_ART[intro]=DOOR_ART[act.normal[0]];DOOR_KIND[intro]='ต่อสู้';DOORS[intro]=[ENEMY[intro].name,'เลือดน้อยกว่า · โจมตีช้ากว่า'];
 if(i){ENEMY[act.boss]={hp:1200,damage:30,interval:3,name:act.bossName};DOOR_ART[act.boss]=DOOR_ART[act.bossTemplate];}
 ACT_ENEMIES[act.boss]={template:act.bossTemplate,act:i+1,boss:true};if(i){DOOR_KIND[act.boss]='ผู้พิทักษ์';DOORS[act.boss]=[act.bossName,'บททดสอบท้ายด่าน'];}
}
const previousLocalRoom=localRoom,previousEnemyLevel=enemyLevel;
localRoom=room=>isActJourney()?actLocalRoom(room):previousLocalRoom(room);
enemyLevel=room=>isActJourney()?actNumber(room):previousEnemyLevel(room);
function actRecord(type,extra={}){run.journeyLog??=[];run.journeyLog.push({type,room:run.room,act:run.room?actNumber(run.room):1,...extra});}
function actRouteRandom(room){let a=((run.routeSeed^Math.imul(room+1,0x9E3779B9)^0xA17E2048)>>>0);return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function actDoors(room){
 if(!Number.isInteger(room)||room<1||room>30)throw Error('ห้องการเดินทางไม่ถูกต้อง');
 const act=actDefinition(room),local=actLocalRoom(room),random=actRouteRandom(room),pick=items=>items[Math.floor(random()*items.length)];
 let options;
 if(local===10)return[act.boss];
 if(local===1)options=[act.intro,act.normal[0]];
 else if(local===2)options=act.normal.slice(0,2);
 else if(local===4)options=act.normal.slice(1,3);
 else if(local===7){const last=run.history.find(r=>r.act===actNumber(room)&&r.localRoom===4)?.type;const pool=act.normal.filter(id=>id!==last);const first=pick(pool);options=[first,pick(pool.filter(id=>id!==first))];}
 else if(local===9)options=['rest',has('heavyCoin')?'quiz':pick(['shop','quiz'])];
 else{
  const count=run.serviceCounts?.[actNumber(room)]||0,roll=random()*100;
  const service=count>=3||roll<20?null:roll<50?'rest':roll<80?'quiz':'shop';
  const first=pick(act.normal);options=[first,service||pick(act.normal.filter(id=>id!==first))];
 }
 return random()<.5?options:options.reverse();
}
function actStats(enemy,room){const act=actDefinition(room),base=ENEMY[enemy];if(!act||!ACT_ENEMIES[enemy]||ACT_ENEMIES[enemy].act!==actNumber(room))throw Error('ศัตรูไม่อยู่ในด่านนี้');
 const gentle=actNumber(room)===1&&actLocalRoom(room)<=3;
 return{hp:Math.round(base.hp*act.growth),damage:Math.round((gentle?({mushroom:10,beetle:13}[enemy]??base.damage):base.damage)*act.growth),interval:run.mechanicsVersion===1&&enemy==='stag'?4:base.interval};
}
function initActJourney(){
 if(run.endlessVersion===1)throw Error('รุ่นการเดินทางขัดกัน');
 run.room=0;run.serviceCounts={};run.journeyLog=[];run.phase='doors';
 const cfg={...BASE,...run.companion.config,rune:run.companion.eggPrefix,skillVersion:run.skillVersion,autoSkill:skillIdentity(run.companion),mechanicsVersion:run.mechanicsVersion,contentVersion:run.contentVersion};
 state=fresh(run.hero,'mushroom',cfg);state.board=Array(16).fill(null);delete state.relic;delete state.hazards;
 if(run.mechanicsVersion===1)regionalState(state);
 actRecord('start');makeDoors();return state;
}
const beforeActSavedRun=savedRun;
savedRun=function(key){let saved;try{saved=JSON.parse(localStorage.getItem(key));}catch{return null;}
 if(saved?.journeyVersion!==undefined&&saved.journeyVersion!==ACT_JOURNEY_VERSION)return null;
 if(saved?.contentVersion!==undefined&&(saved.contentVersion!==1||saved.mechanicsVersion!==1||saved.journeyVersion!==1))return null;
 if(saved?.mechanicsVersion!==undefined&&(saved.mechanicsVersion!==1||saved.journeyVersion!==1))return null;
 if(saved?.journeyVersion!==ACT_JOURNEY_VERSION)return beforeActSavedRun(key);
 if(saved.endlessVersion===1||saved.version!==3||!Number.isInteger(saved.room)||saved.room<0||saved.room>30||!saved.companion?.config||!Array.isArray(saved.questions)||saved.questions.length<3||!Array.isArray(saved.history)||!Array.isArray(saved.relics)||!Array.isArray(saved.battle?.board)||saved.battle.board.length!==16||!saved.serviceCounts||(saved.phase==='doors'&&(!Array.isArray(saved.doors)||!saved.doors.length)))return null;
 if(saved.battle.cfg?.contentVersion!==saved.contentVersion)return null;
 if(saved.mechanicsVersion===1&&!regionalValidSave(saved.battle))return null;
 return saved;
};
const beforeActEligible=relicEligible;
relicEligible=function(relic,journey=run){return !(journey?.journeyVersion===ACT_JOURNEY_VERSION&&relic.id==='crown')&&beforeActEligible(relic,journey);};
function actRewardOffers(nextAct){
 const result=[],take=(pool,weights)=>{const candidates=pool.filter(r=>!result.includes(r.id)&&relicEligible(r));if(!candidates.length)return;
  const roll=rng()*100,grade=roll<weights[0]?'Common':roll<weights[0]+weights[1]?'Rare':'Epic';const filtered=candidates.filter(r=>r.grade===grade),choices=filtered.length?filtered:candidates;result.push(choices[Math.floor(rng()*choices.length)].id);};
 const specific=ACT_RELIC_POOLS[nextAct.id]||[];
 if(specific.length)take(RELIC_V1.filter(r=>specific.includes(r.id)),[40,40]);
 while(result.length<3){const before=result.length;take(RELIC_V1.filter(r=>!r.region&&['Rare','Epic'].includes(r.grade)),[0,70]);if(result.length===before){take(RELIC_V1,[60,30]);if(result.length===before)break;}}
 return result;
}
const beforeActEnter=enterBattle;
enterBattle=function(enemy){
 if(!isActJourney())return beforeActEnter(enemy);
 const previous=state,stats=actStats(enemy,run.room),cfg={...BASE,...run.companion.config,rune:run.companion.eggPrefix,skillVersion:run.skillVersion,autoSkill:skillIdentity(run.companion),enemyHp:stats.hp,damage:stats.damage,interval:stats.interval,relicVersion:run.relicVersion,relics:[...run.relics],relicShadow:has('shadow'),relicSpark:false,mechanicsVersion:run.mechanicsVersion,contentVersion:run.contentVersion};
 state=fresh(run.hero,enemy,cfg);state.board=run.room>1?cleanFrom(previous.board):Array(16).fill(null);state.hp=previous.hp;state.charge=previous.charge;
 // fresh() makes demonstration tiles with Math.random, including a queued rune.
 // Discard that queue before spawning any journey tiles with the replay seed.
 delete state.relic;
 delete state.hazards;if(run.mechanicsVersion===1)for(const t of state.board)if(t){delete t.uid;delete t.bornMove;delete t.crack;}
 while(state.board.filter(Boolean).length<2)spawn(state,rng);
 state.cfg.skillBase={...cfg};delete state.cfg.skillBase.skillBase;
 const rs=relicState(state);rs.autoCount=run.relicAutoCount||0;rs.direction=DIRS[Math.floor(rng()*4)];rs.nextRune=relicRune(state,rng);
 if(has('drum'))state.cfg.interval=Math.max(1,state.cfg.interval-1);state.countdown=state.cfg.interval;
 if(has('instant'))state.charge=state.cfg.cooldown;
 if(has('jar')){state.hp=Math.max(1,state.hp-Math.ceil(state.cfg.hp*.08));for(let n=0;n<3;n++){const empty=state.board.map((t,i)=>t?null:i).filter(i=>i!==null);if(!empty.length)break;state.board[empty[Math.floor(rng()*empty.length)]]={v:16,t:['a','d','h','x'][Math.floor(rng()*4)],f:0};}}
 if(run.relicCarry){const power=Math.min(run.relicCarry,state.cfg.enemyHp*.5);run.relicCarry=0;relicHit(state,power,false,false);}
 run.phase='battle';run.echo=false;actRecord('enterBattle',{enemy,hp:state.hp});hidePanel();updateImages();render();persist();
};
const beforeActDoors=makeDoors;
makeDoors=function(){if(!isActJourney())return beforeActDoors();if(run.room>=30)throw Error('การเดินทางครบแล้ว');run.phase='doors';run.doors=actDoors(run.room+1);};
const beforeActDoor=enterDoor;
enterDoor=function(type){
 if(!isActJourney())return beforeActDoor(type);
 if(run.phase!=='doors'||!run.doors.includes(type))return;
 run.room++;const act=actNumber(run.room),local=actLocalRoom(run.room);
 if(local===1)actRecord('enterAct');actRecord('chooseDoor',{door:type});
 if(ACT_ENEMIES[type]){enterBattle(type);return;}
 if([3,5,6,8].includes(local))run.serviceCounts[act]=(run.serviceCounts[act]||0)+1;
 state.armor=0;run.echo=false;
 if(type==='rest'&&has('noRest')){run.history.push({room:run.room,act,localRoom:local,type:'relicWell',hp:state.hp});relicReward();}
 else{run.phase=type;if(type==='shop')run.offers=offers();if(type==='quiz')beginQuiz(false);}
 persist();showPhase();
};
const beforeActUtility=completeUtility;
completeUtility=function(){if(!isActJourney())return beforeActUtility();if(!['rest','shop','quizReward'].includes(run.phase))return;run.history.push({room:run.room,act:actNumber(run.room),localRoom:actLocalRoom(run.room),type:run.phase,hp:state.hp});actRecord('completeService',{service:run.phase});makeDoors();persist();showPhase();};
const beforeActSettle=settleRun;
settleRun=function(){
 if(!isActJourney())return beforeActSettle();if(run.phase!=='battle')return;
 if(state.status==='lost'){actRecord('defeat',{enemy:state.enemy,hp:state.hp});run.phase=!run.revived&&!has('tome')?'revivePrompt':'failed';persist();showPhase();return;}
 if(state.status!=='won')return;
 const act=actNumber(run.room),local=actLocalRoom(run.room),boss=local===10;
 if(act===1&&local<=3)state.hp=Math.min(state.cfg.hp,state.hp+Math.ceil(state.cfg.hp*.2));
 run.coins+=local===4?45:20;
 run.history.push({room:run.room,act,localRoom:local,type:state.enemy,battle:true,boss,moves:state.moves,hp:state.hp});actRecord('win',{enemy:state.enemy,boss,hp:state.hp});
 if(boss){
  state.board.forEach(t=>{if(t)t.f=0;});state.armor=0;if(run.mechanicsVersion!==1)delete state.hazards;delete state.poison;
  if(act===3){run.phase='complete';actRecord('complete');persist();showPhase();return;}
  state.hp=Math.min(state.cfg.hp,state.hp+Math.ceil(state.cfg.hp*.5));
  run.phase='relic';run.rewardRemaining=1;run.rewardNextAct=act+1;run.offers=actRewardOffers(ACTS[act]);actRecord('actReward',{nextAct:act+1,hp:state.hp});
 }else if(local===2||local===4)relicReward();else makeDoors();
 persist();showPhase();
};
const beforeActChoose=chooseRelic;
chooseRelic=function(id){if(!isActJourney())return beforeActChoose(id);const previous=run.relics.length;beforeActChoose(id);if(run.relics.length>previous){actRecord('relic',{id});if(run.phase!=='relic')delete run.rewardNextAct;persist();}};
const beforeActHUD=runHUD;
runHUD=function(){if(!isActJourney())return beforeActHUD();beforeActHUD();const room=Math.max(1,run.room),act=actDefinition(room);document.querySelector('#run-hud').textContent=`ด่าน ${actNumber(room)}/3 · ${act.name} · ห้อง ${actLocalRoom(room)}/10 · ช่วยชีวิต ${run.revived?'ใช้แล้ว':'เหลือ 1 ครั้ง'}`;};
const beforeActPhase=showPhase;
showPhase=function(){
 if(!isActJourney())return beforeActPhase();
 if(run.phase==='doors'){
  runHUD();const room=run.room+1,act=actDefinition(room);
  return panel(`เลือกเส้นทาง · ${act.name} · ห้อง ${actLocalRoom(room)}/10`,`ด่าน ${actNumber(room)}/3 · HP ${state.hp}/${state.cfg.hp} · ${run.coins} เหรียญ`,run.doors.map(type=>{const enemy=ACT_ENEMIES[type],stats=enemy?actStats(type,room):null;return{title:typeof actArtName==='function'&&enemy?actArtName(type):run.contentVersion===1&&enemy?contentName(type):type==='rest'&&has('noRest')?'บ่อน้ำพันธะ · เลือกเรลิค':DOORS[type][0],desc:stats?`HP ${stats.hp} · ตี ${stats.damage} ทุก ${stats.interval} ปัด${run.contentVersion===1&&CONTENT_ENEMIES[type]?' · '+CONTENT_ENEMIES[type].mechanic:''}`:type==='shop'?'Common 30 / Rare 50 / Epic 80':type==='rest'&&has('noRest')?'เลือกเรลิคแทนฟื้น HP':DOORS[type][1],art:typeof actArtSource==='function'?actArtSource(type):DOOR_ART[type],kind:DOOR_KIND[type],action:()=>enterDoor(type)};}));
 }
 return beforeActPhase();
};
