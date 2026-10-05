'use strict';
const actPreviewRequested=()=>true;
const beforeActDistance=distance;
distance=()=>isActJourney()?run.history.length:beforeActDistance();
const beforeActImages=updateImages,beforeActRender=render;
updateImages=function(){beforeActImages();if(!isActJourney())return;const meta=ACT_ENEMIES[state.enemy];if(!meta)return;const enemy=document.querySelector('.battle .enemy');enemy.src=DOOR_ART[state.enemy];enemy.alt=(run.contentVersion===1?contentName(state.enemy):ENEMY[state.enemy].name);};
render=function(){beforeActRender();if(!isActJourney()||run.room<1)return;document.querySelector('#enemy-label').textContent=(run.contentVersion===1?contentName(state.enemy):ENEMY[state.enemy].name)+' · '+actDefinition(run.room).name;};
const beforeActHome=showHome;
showHome=function(){
 if(!actPreviewRequested()&&!isActJourney())return beforeActHome();
 if(!forestAccount)return initRun();screen='home';const t=screenContent('การเดินทาง 3 ด่าน');
 t.querySelector('.forest-heading span').textContent='QUIZMON · ผู้พิทักษ์ผลึก';
 t.append(node('p','ป่าผลึก → ถ้ำผลึก → ภูเขาลอยฟ้า'),node('p','ด่านละ 10 ห้อง · เลือกเส้นทางและเตรียมคู่หูให้พร้อม'));
 if(isActJourney()&&!terminal()){const card=node('section',undefined,'forest-card');card.append(node('h3',run.companion?.name||'คู่หู'),node('p',`ด่าน ${actNumber(Math.max(1,run.room))}/3 · ผ่านแล้ว ${distance()}/30 ห้อง`),button('เล่นต่อ',()=>restoreRun(run),true));t.append(card);}
 t.append(button('เลือกคู่หู · เริ่ม 3 ด่าน',showNewRun,!(isActJourney()&&!terminal())));
 const board=node('section',undefined,'forest-card');board.append(node('h3','🏆 ผู้พิทักษ์ไปไกลสุด'));boardRows(board,(competitionData.board?.leaders||[]).slice(0,3));ownRank(board);board.append(button('ดูอันดับทั้งหมด',showLeaderboard));t.append(board);
 t.append(button('สถิติของฉัน',showStats),button('กลับ QuizMon',()=>location.assign('/pet')));
 if(competitionData.loadError)t.append(node('p',competitionData.loadError),button('โหลดอันดับใหม่',async()=>{await loadCompetition();showHome();}));
 t.append(node('small','ฉบับทดลอง · จัดอันดับจากห้องที่ผ่าน รวมทุกเส้นทาง · ไกลเท่ากันได้อันดับร่วม','forest-note'),syncNode());
};
const beforeActSummary=showSummary;
showSummary=function(refresh=true){
 if(!isActJourney())return beforeActSummary(refresh);
 screen='summary';const t=screenContent(run.phase==='complete'?'ผู้พิทักษ์ยอมรับคู่หู':'บันทึกการเดินทาง');
 const wins=run.history.filter(r=>r.battle),bosses=wins.filter(r=>r.boss);
 t.querySelector('.forest-heading span').textContent='QUIZMON · ผู้พิทักษ์ผลึก';
 const record=node('div',undefined,'forest-record');record.append(image(run.companion?.image));t.append(record,node('p',run.phase==='complete'?'ผ่านผู้พิทักษ์ทั้งสามแล้ว':run.phase==='failed'?'พักคู่หู แล้วกลับมาลองเส้นทางใหม่':'พักการเดินทางครั้งนี้แล้ว'));
 const grid=node('div',undefined,'forest-metrics');metric(grid,bosses.length,'ด่านที่ผ่าน');metric(grid,run.history.length,'ห้องที่ผ่าน / 30');metric(grid,run.runMetrics?.swipes||0,'ปัดทั้งหมด');t.append(grid);
 t.append(node('p',bosses.length?bosses.map(r=>ACTS[r.act-1].name).join(' · '):'ยังไม่ผ่านผู้พิทักษ์'),node('small','ผลรอบนี้ส่งเข้าอันดับสามด่าน · ไกลเท่ากันได้อันดับร่วม','forest-note'),syncNode(),button('ดูอันดับทั้งหมด',showLeaderboard),button('เลือกคู่หู · เล่นอีกครั้ง',showNewRun,true),button('กลับ QuizMon',()=>location.assign('/pet')));
 if(refresh)flushCompetition();
};
function trackActSession(type){if(!isActJourney()||terminal()||!run.competition)return;track({type:'session',value:type},()=>{run.sessionCounts??={resume:0,leave:0};run.sessionCounts[type]++;run.lastSession={type,room:run.room,phase:run.phase};});}
const beforeActRestore=restoreRun;
restoreRun=function(saved){beforeActRestore(saved);trackActSession('resume');};
document.addEventListener('visibilitychange',()=>trackActSession(document.hidden?'leave':'resume'));
