'use strict';
// Account-scoped outbox survives a finished run, a new run and offline reloads.
let competitionData={board:{leaders:[],mine:null,players:0},stats:null},outbox=[],sending=null,screen='home',syncError='';
const terminal=()=>run&&['failed','ended','complete'].includes(run.phase);
let distance=()=>Math.max(0,...(run?.history||[]).map(r=>r.room));
const outboxKey=()=>SAVE+':outbox:'+forestAccount.accountId;
function saveOutbox(){try{localStorage.setItem(outboxKey(),JSON.stringify(outbox));}catch{syncError='เครื่องนี้บันทึกผลไม่ได้ โปรดเปิดพื้นที่จัดเก็บ';}}
function loadOutbox(){try{outbox=JSON.parse(localStorage.getItem(outboxKey()))||[];if(!Array.isArray(outbox))outbox=[];}catch{outbox=[];}}
function syncText(){return syncError||(outbox.some(q=>q.blocked)?'ผลรันก่อนหน้าตรวจสอบไม่ได้ · รันใหม่ยังแข่งได้':outbox.some(q=>q.events.length)?'เก็บผลในเครื่องแล้ว · กำลังส่งอันดับ':'บันทึกผลแล้ว');}
async function loadCompetition(){try{competitionData=await forestRequest('/api/2048/competition');}catch{competitionData={...competitionData,loadError:'ยังโหลดอันดับไม่ได้'};}}
let competitionTimer;
function scheduleCompetition(){if(competitionTimer)return;competitionTimer=setTimeout(()=>{competitionTimer=null;flushCompetition();},650);}
async function flushCompetition(){
 if(sending||!forestAccount||!outbox.some(q=>q.events.length&&!q.blocked))return sending;
 clearTimeout(competitionTimer);competitionTimer=null;
 const account=forestAccount.accountId;
 sending=(async()=>{try{while(outbox.some(q=>q.events.length)){
  const q=outbox.find(q=>q.events.length&&!q.blocked);if(!q)break;const events=q.events.slice(0,256);
  const ack=await forestRequest('/api/2048/competition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:q.id,from:q.from,events})});
  if(forestAccount?.accountId!==account)return;
  const accepted=Math.min(q.events.length,Math.max(0,ack.revision-q.from));
  if(!accepted)throw Error('ยังบันทึกผลไม่ได้');q.events.splice(0,accepted);q.from=ack.revision;
  outbox=outbox.filter(x=>x.events.length||x.id===run?.competition?.id);saveOutbox();syncError='';
  document.querySelectorAll('[data-sync]').forEach(n=>n.textContent=syncText());
 }if(screen!=='game'){await loadCompetition();if(screen==='summary')showSummary(false);}}
 catch(error){if(error.status===422){const q=outbox.find(q=>q.events.length&&!q.blocked);if(q)q.blocked=true;saveOutbox();}
  syncError=error.status===422?'ผลรันนี้ตรวจสอบไม่ได้ · เริ่มรันใหม่เพื่อแข่งต่อ':error.status===409?'ยังจัดลำดับผลไม่ได้ · เก็บในเครื่องแล้ว':error.status===401?'เข้าสู่ระบบอีกครั้งเพื่อส่งผล':'ออฟไลน์ · เก็บผลไว้ส่งเมื่อเชื่อมต่อ';document.querySelectorAll('[data-sync]').forEach(n=>n.textContent=syncText());}
 finally{sending=null;}})();return sending;
}
let tracking=0,phaseRendering=0;
const checkpointPersist=persist;
// Ranked actions save once after metrics and journal are updated; legacy runs still save normally.
persist=function(){if(tracking&&run?.competition)return;checkpointPersist();};
function track(event,action){const outer=tracking===0;const acts=typeof isActJourney==='function'&&isActJourney();const before=acts&&event.type!=='swipe'?JSON.stringify([run.phase,run.room,run.seed,run.coins,run.relics,run.quiz,run.revived,run.history.length,run.sessionCounts]):null;
 const endingPhase=run?.phase;tracking++;let result;try{result=action();}finally{tracking--;}
 if(before!==null&&before===JSON.stringify([run.phase,run.room,run.seed,run.coins,run.relics,run.quiz,run.revived,run.history.length,run.sessionCounts]))return result;
 if(outer&&acts&&event.type==='end')actRecord('end',{phase:endingPhase});
 if(outer&&run?.competition){run.runMetrics.maxRune=Math.max(run.runMetrics.maxRune,...state.board.filter(Boolean).map(t=>t.v));let q=outbox.find(q=>q.id===run.competition.id);if(!q){q={id:run.competition.id,from:0,events:[]};outbox.push(q);}q.events.push(event);saveOutbox();persist();
  // A microtask runs after the current choice has finished rendering its next phase.
  queueMicrotask(()=>{if(event.type==='swipe')scheduleCompetition();else flushCompetition();document.querySelectorAll('[data-sync]').forEach(n=>n.textContent=syncText());});}
 return result;
}
const oldSwipe=runSwipe;
runSwipe=function(dir){const before=state.moves;tracking++;try{oldSwipe(dir);}finally{tracking--;}
 if(state.moves===before)return;
 run.runMetrics??={swipes:0,maxRune:0};run.runMetrics.swipes++;run.runMetrics.maxRune=Math.max(run.runMetrics.maxRune,...state.board.filter(Boolean).map(t=>t.v));
 track({type:'swipe',value:dir},()=>{});
};
const oldDoor=enterDoor,oldChoose=chooseRelic,oldAnswer=answer,oldUtility=completeUtility,oldChoice=relicChoice;
enterDoor=type=>track({type:'door',value:type},()=>oldDoor(type));
chooseRelic=id=>track({type:'relic',value:id},()=>oldChoose(id));
answer=index=>track({type:'answer',value:index},()=>oldAnswer(index));
completeUtility=()=>track({type:'utility'},oldUtility);
relicChoice=function(id,shop=false){const c=oldChoice(id,shop);if(shop){const action=c.action;c.action=()=>track({type:'buy',value:id},action);}return c;};
const oldPanel=panel;
panel=function(title,text,choices){screen='game';const phase=run?.phase;
 const mapped=choices.map((c,i)=>{let event;
  if(!phaseRendering)return c;
  if(phase==='rest')event='utility';
  else if(phase==='quizReward'&&run.quizPassed&&i===0)event='quizRelic';
  else if(phase==='revivePrompt')event=i===0?'revive':'end';
  else if(phase==='relic'&&!run.offers.length)event='cash';
  return event?{...c,action:()=>track({type:event},c.action)}:c;
 });oldPanel(title,text,mapped);
 if(phaseRendering){const nav=node('div',undefined,'phase-navigation');const pause=button('พัก',()=>showGameMenu());pause.setAttribute('aria-label','เมนูพักการเดินทาง');nav.append(button('หน้าแรก',showHome),pause);document.querySelector('#run-content').prepend(nav);}
};
const oldHUD=runHUD;let relicHUDKey;
runHUD=function(){const key=JSON.stringify([run.coins,run.relics]);if(key===relicHUDKey&&document.querySelector('#relics .forest-wallet'))return;relicHUDKey=key;oldHUD();document.querySelector('#run-hud').replaceChildren();
 const collection=document.querySelector('#relics');const wallet=document.createElement('span');wallet.className='forest-wallet';wallet.textContent='◈ '+run.coins;wallet.setAttribute('aria-label',run.coins+' เหรียญ');wallet.title='เหรียญสำหรับร้านนักเดินทาง';collection.prepend(wallet);
};
const oldPhase=showPhase;
showPhase=function(){if(terminal()){showSummary();return;}screen='game';phaseRendering++;try{oldPhase();}finally{phaseRendering--;}};
const oldRestore=restoreRun;
restoreRun=function(saved){oldRestore(saved);if(run.phase==='battle'&&state.status!=='playing')settleRun();flushCompetition();};
showCompanions=function(){screen='picker';showCompanionPicker(forestAccount,startRun,showHome);};
showNewRun=function(){if(!forestAccount)return initRun();if(run&&!terminal()){panel('เริ่มรันใหม่?','รันปัจจุบันจะจบลง ผลที่ผ่านยังเก็บไว้ในสถิติ',[{title:'กลับไปเล่นต่อ',action:showPhase},{title:'จบรันนี้แล้วเลือกคู่หูใหม่',action:()=>{track({type:'end'},()=>{run.phase='ended';persist();});showCompanions();}}]);return;}showCompanions();};
startRun=async function(petId){panel('เตรียมออกสำรวจ','กำลังอ่านสเตตัสและคำถามสำหรับการเดินทาง',[]);try{
 const snapshot=await forestRequest('/api/2048/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({petId,balanceVersion:4,...(new URLSearchParams(location.search).get('journey')==='three-acts'?{journeyVersion:1,mechanicsVersion:1}:{})})});
 if(snapshot.accountId!==forestAccount?.accountId)throw Error('บัญชีเปลี่ยนแล้ว กรุณาเลือกคู่หูอีกครั้ง');
 if(new URLSearchParams(location.search).get('journey')==='three-acts'&&(snapshot.initial?.run?.journeyVersion!==1||snapshot.initial?.run?.mechanicsVersion!==1))throw Error('การเดินทาง 3 ด่านยังไม่พร้อม กรุณาลองใหม่');
 if(snapshot.initial){run=snapshot.initial.run;state=snapshot.initial.state;run.competition={id:snapshot.competition.id};run.runMetrics=snapshot.initial.metrics;
  outbox.push({id:run.competition.id,from:0,events:[]});saveOutbox();persist();updateImages();showPhase();}
 else { // Older saved runs and local art fixtures remain playable without ranking.
  run={version:3,runeVersion:1,balanceVersion:3,endlessVersion:1,relicVersion:1,skillVersion:1,accountId:snapshot.accountId,companion:snapshot.companion,questions:snapshot.questions,hero:snapshot.companion.lane,seed:Date.now()>>>0,room:1,coins:0,relics:[],phase:'battle',revived:false,started:Date.now(),history:[]};run.routeSeed=run.seed;enterBattle('mushroom');}
 }catch(error){forestError(error);}};
initRun=async function(){oldPanel('กำลังเปิดป่าผลึก','กำลังอ่านการเดินทางและอันดับ',[]);try{
 forestAccount=await forestRequest('/api/2048/companions');loadOutbox();const saved=savedRun(SAVE+':'+forestAccount.accountId);
 if(saved?.accountId===forestAccount.accountId){run=saved;state=saved.battle;}
 showHome();loadCompetition().then(()=>{if(screen==='home')showHome();});flushCompetition();
 }catch(error){forestError(error);}};
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function button(label,action,primary=false){const b=node('button',label,primary?'forest-primary':'forest-secondary');b.onclick=action;return b;}
function screenContent(label){const target=document.querySelector('#run-content');target.className='forest-screen';target.onclick=target.oninput=target.onchange=null;target.replaceChildren();
 document.querySelector('#run-panel').hidden=false;document.querySelector('main').inert=true;
 const head=node('div',undefined,'forest-heading');head.append(node('span','QUIZMON · ENDLESS'),button('หน้าแรก',showHome));target.append(head,node('h2',label));return target;}
function syncNode(){const n=node('small',syncText(),'forest-sync');n.dataset.sync='';return n;}
function image(path){const n=node('img');n.src=typeof path==='string'&&path.startsWith('/pets/')?path:'/pets/egg1_stage4_math_A.png';n.alt='';return n;}
function boardRows(target,rows){if(!rows.length){target.append(node('p','ยังไม่มีอันดับ · ผ่านห้องแรกแล้วมาเป็นผู้บุกเบิกกัน'));return;}
 for(const row of rows){const item=node('div',undefined,'forest-rank'+(row.mine?' mine':''));item.append(node('strong','#'+row.rank),image(row.companion?.image),node('span',row.mine?row.name+' · คุณ':row.name),node('b',row.rooms+' ห้อง'));target.append(item);}}
function ownRank(target){const mine=competitionData.board?.mine;target.append(node('p',mine?'อันดับคุณ #'+mine.rank+' · สถิติ '+mine.rooms+' ห้อง':'ผ่านห้องแรกเพื่อขึ้นอันดับ','forest-own-rank'));}
function showHome(){if(!forestAccount)return initRun();screen='home';const t=screenContent('ป่าผลึกไร้สิ้นสุด');
 const hero=node('section',undefined,'forest-home-hero');hero.append(image(run?.companion?.image||forestAccount.companions?.find(p=>p.isActive)?.image),node('p','พาคู่หูไปให้ไกลกว่าเดิม'));t.append(hero);
 if(run&&!terminal()){const resume=node('div',undefined,'forest-card');resume.append(node('small','การเดินทางที่บันทึกไว้'),node('h3',run.companion?.name||'คู่หูของคุณ'),node('p','ผ่านแล้ว '+distance()+' ห้อง · '+run.relics.length+' เรลิค'),button('เล่นต่อ',()=>restoreRun(run),true));t.append(resume);}
 t.append(button(run&&!terminal()?'เริ่มรันใหม่':'เลือกคู่หู · เริ่มสำรวจ',showNewRun,!(run&&!terminal())));
 const card=node('section',undefined,'forest-card');card.append(node('h3','🏆 ใครไปไกลสุด'));boardRows(card,(competitionData.board?.leaders||[]).slice(0,3));ownRank(card);card.append(button('ดูอันดับทั้งหมด',showLeaderboard));t.append(card);
 const nav=node('div',undefined,'forest-actions');nav.append(button('สถิติของฉัน',showStats),...(terminal()?[button('ดูผลรันล่าสุด',()=>showSummary())]:[]));t.append(nav);
 if(competitionData.loadError)t.append(node('p',competitionData.loadError),button('โหลดอันดับใหม่',async()=>{await loadCompetition();showHome();}));
 t.append(node('small','ผ่านห้องแล้วอัปเดตอันดับ · ระยะเท่ากันได้อันดับร่วม','forest-note'),syncNode());t.querySelector('button.forest-primary')?.focus();}
async function showLeaderboard(){screen='leaderboard';await loadCompetition();if(screen!=='leaderboard')return;const t=screenContent('นักสำรวจไปไกลสุด');t.append(node('p','นับห้องที่ผ่านสำเร็จ · เก็บรันที่ดีที่สุดของแต่ละคน'));ownRank(t);const list=node('div');boardRows(list,competitionData.board?.leaders||[]);t.append(list);
 let page=0,shown=(competitionData.board?.leaders||[]).length;const more=button('ดูอันดับถัดไป',async()=>{more.disabled=true;try{const data=await forestRequest('/api/2048/competition?page='+(page+1));boardRows(list,data.board.leaders);page++;shown+=data.board.leaders.length;more.hidden=shown>=data.board.players||!data.board.leaders.length;}catch{more.textContent='ลองโหลดอันดับถัดไปอีกครั้ง';}finally{more.disabled=false;}});more.hidden=shown>=(competitionData.board?.players||0);
 t.append(more,node('small','นักสำรวจ '+(competitionData.board?.players||0)+' คน · ระยะเท่ากันได้อันดับร่วม','forest-note'),button('รีเฟรชอันดับ',showLeaderboard));}
function metric(target,value,label){const card=node('div',undefined,'forest-metric');card.append(node('strong',String(value)),node('small',label));target.append(card);}
async function showStats(){screen='stats';await loadCompetition();if(screen!=='stats')return;const t=screenContent('สถิติของฉัน'),s=competitionData.stats;if(!s){t.append(node('p','ยังโหลดสถิติไม่ได้'),button('ลองใหม่',showStats));return;}
 const grid=node('div',undefined,'forest-metrics');metric(grid,s.best,'ผ่านได้ไกลสุด');metric(grid,s.runs,'รันทั้งหมด');metric(grid,s.bosses,'บอสที่ชนะ');metric(grid,s.maxRune,'รูนสูงสุด');t.append(grid,node('h3','การเดินทางล่าสุด'));
 for(const r of s.recent||[]){const item=node('div',undefined,'forest-history');item.append(image(r.companion?.image),node('div',r.companion?.name||'คู่หู'),node('strong',r.rooms+' ห้อง'),node('small',(r.status==='active'?'กำลังเดินทาง':r.status==='failed'?'จบการต่อสู้':'จบรัน')+' · '+new Date(r.date).toLocaleDateString('th-TH')));t.append(item);}t.append(syncNode());}
function showSummary(refresh=true){screen='summary';const t=screenContent('บันทึกการเดินทาง');
 const rooms=distance(),s=competitionData.stats,m=run.runMetrics||{swipes:run.history.reduce((n,r)=>n+(r.moves||0),0)+state.moves,maxRune:Math.max(0,...state.board.filter(Boolean).map(t=>t.v))};
 t.append(node('p',run.phase==='failed'?'คู่หูเหนื่อยแล้ว · กลับมาผจญภัยได้อีกครั้ง':'พักการเดินทางครั้งนี้แล้ว'));
 const record=node('div',undefined,'forest-record');record.append(image(run.companion?.image),node('strong',String(rooms)),node('span','ห้องที่ผ่านสำเร็จ'));t.append(record);
 const best=Math.max(s?.best||0,rooms);t.append(node('p',rooms>0&&rooms>=(s?.best||0)?'✦ สถิติที่ดีที่สุดของคุณ · '+best+' ห้อง':'สถิติส่วนตัว '+best+' ห้อง','forest-own-rank'));
 const mine=competitionData.board?.mine;t.append(node('p',mine?'อันดับ #'+mine.rank+' · อ้างอิงรันที่ดีที่สุด':'ผ่านห้องแรกเพื่อเริ่มอันดับ'));
 const grid=node('div',undefined,'forest-metrics');metric(grid,run.history.filter(r=>r.type==='stag').length,'บอสที่ชนะ');metric(grid,m.maxRune,'รูนสูงสุด');metric(grid,m.swipes,'ปัดทั้งหมด');t.append(grid);
 const relics=node('div',undefined,'forest-build');for(const id of run.relics){const r=RELIC_V1.find(r=>r.id===id);if(!r)continue;const b=button('',()=>showSummaryRelic(id));b.title=r.name;const art=node('img');art.src=relicArtPath(id);art.alt=r.name;b.append(art);relics.append(b);}t.append(node('h3',(run.companion?.name||'คู่หู')+' · '+run.relics.length+' เรลิค'),relics,syncNode(),button('เลือกคู่หู · เล่นอีกครั้ง',showNewRun,true),button('ดูสถิติของฉัน',showStats));
 if(!run.competition)t.append(node('small','รันเดิมก่อนเปิดอันดับเก็บไว้เล่นต่อได้ · เริ่มรันใหม่เพื่อแข่งอันดับ','forest-note'));
 if(refresh){flushCompetition();loadCompetition().then(()=>{if(screen==='summary')showSummary(false);});}}
function showSummaryRelic(id){const r=RELIC_V1.find(r=>r.id===id);oldPanel(r.name,r.desc,[{title:'กลับไปผลรัน',action:()=>showSummary(false)}]);}
showGameMenu=function(){persist();panel('พักการเดินทาง','บันทึกในเครื่องแล้ว ออกเกมแล้วกลับมาเล่นต่อได้',[{title:'เล่นต่อ',action:showPhase},{title:'หน้าแรก · ดูอันดับ',action:showHome},...(run?.companion?[{title:'ดูพลังคู่หู',action:showCompanionSnapshot}]:[]),{title:'จบการเดินทางครั้งนี้',action:()=>{oldPanel('จบรันนี้ไหม?','ผลที่ผ่านยังเก็บไว้ แต่จะกลับมาเล่นรันนี้ต่อไม่ได้',[{title:'กลับไปเล่นต่อ',action:showPhase},{title:'ยืนยันจบรัน',action:()=>track({type:'end'},()=>{run.phase='ended';persist();showSummary();})}]);}}]);};
document.querySelector('#reset').onclick=showGameMenu;
const soundButton=document.querySelector('#sound-toggle'),soundAction=soundButton.onclick;
soundButton.onclick=()=>{soundAction();soundButton.textContent=sound?'🔊':'🔈';soundButton.setAttribute('aria-label',sound?'ปิดเสียง':'เปิดเสียง');};soundButton.textContent='🔈';soundButton.setAttribute('aria-label','เปิดเสียง');
window.addEventListener('online',()=>flushCompetition());window.addEventListener('pagehide',()=>{persist();if(forestAccount)saveOutbox();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){persist();if(forestAccount){saveOutbox();flushCompetition();}}});
setInterval(()=>flushCompetition(),15000);
initRun();
