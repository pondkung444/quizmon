'use strict';
// Presentation only: enemy IDs, stats, random queues and checkpoints remain unchanged.
const ACT_ART={
 mushroom:{name:'เห็ดผลึก',src:'crystal-mushroom-v1.png'},
 beetle:{name:'ด้วงแก้ว',src:'crystal-beetle-v1.png'},
 slow_striker:{name:'โกเล็มพฤกษ์',src:'crystal-golem.png'},
 glass_striker:{name:'ตั๊กแตนแก้ว',src:'crystal-swift-v1.webp'},
 stag:{name:'กวางเทพพิทักษ์',src:'divine-stag-guardian-v3.png'},
 cave_light:{name:'ลูกหินผลึก',src:'assets/acts-v1/cave-light-v2.webp'},
 cave_guard:{name:'เต่าผลึก',src:'crystal-heavy-v1.webp'},
 cave_heavy:{name:'โกเล็มถ้ำ',src:'assets/acts-v1/cave-heavy.webp'},
 cave_healer:{name:'ค้างคาวอัญมณี',src:'assets/acts-v1/cave-healer-v2.webp'},
 cave_guardian:{name:'หมีภูผาผลึก',src:'assets/acts-v1/cave-boss-v2.webp'},
 sky_light:{name:'นกเมฆา',src:'assets/acts-v1/sky-light-v2.webp'},
 sky_haste:{name:'เหยี่ยววายุ',src:'assets/acts-v1/sky-haste.webp'},
 sky_heavy:{name:'แร้งผาหิน',src:'assets/acts-v1/sky-heavy-v2.webp'},
 sky_poison:{name:'ผีเสื้อหมอกพิษ',src:'assets/acts-v1/sky-poison-v2.webp'},
 sky_guardian:{name:'มังกรเจ้านภา',src:'assets/acts-v1/sky-dragon-v1.webp'}
};
for(const act of ACTS){ACT_ART[act.intro]=ACT_ART[act.normal[0]];}
function actArtName(id){return ACT_ART[id]?.name||contentName(id);}
function actArtSource(id){return isActJourney()?ACT_ART[id]?.src||DOOR_ART[id]:DOOR_ART[id];}
function applyActScene(){
 const act=isActJourney()?actDefinition(Math.max(1,Math.min(30,run.room+(run.phase==='doors'?1:0)))):null;
 const id=act?.id||'forest';document.body.dataset.act=id;
 document.querySelector('main').dataset.act=id;
 const heading=document.querySelector('header>span');if(heading)heading.textContent='QUIZMON · '+(act?.name||'ป่าผลึก');
}
const beforeArtPhase=showPhase;
showPhase=function(){applyActScene();return beforeArtPhase();};
const beforeArtImages=updateImages;
updateImages=function(){beforeArtImages();applyActScene();if(!isActJourney())return;const enemy=document.querySelector('.battle .enemy');enemy.src=actArtSource(state.enemy);enemy.alt=actArtName(state.enemy);};
const beforeArtRender=render;
render=function(){beforeArtRender();applyActScene();
 const active=isActJourney()&&run.room>=1,enemy=document.querySelector('.battle .enemy'),phase=active&&regionalActive(state)?regionalState(state).bossPhase:1;
 enemy.classList.toggle('guardian-phase-two',active&&!!ACT_ENEMIES[state.enemy]?.boss&&phase===2);
 enemy.classList.toggle('final-guardian',active&&state.enemy==='sky_guardian');enemy.classList.toggle('cave-guardian',active&&state.enemy==='cave_guardian');enemy.dataset.phase=String(phase);
 if(active)document.querySelector('#enemy-label').textContent=actArtName(state.enemy)+' · '+actDefinition(run.room).name;
};
function actArtFx(cell,kind){const el=document.createElement('div');el.className='act-art-fx '+kind;el.setAttribute('aria-hidden','true');position(el,cell);boardEl.append(el);setTimeout(()=>el.remove(),reduced?100:480);}
// Capture merge locations outside gameplay state, including a cracked losing source.
let actRescueTrace={owner:null,move:-1,cells:new Set()};
const beforeArtMerges=relicMerges;
relicMerges=function(s,r,...args){const result=beforeArtMerges(s,r,...args);if(isActJourney()&&s===state&&regionalActive(s)){if(actRescueTrace.owner!==s||actRescueTrace.move!==s.moves)actRescueTrace={owner:s,move:s.moves,cells:new Set()};for(const t of r.merges)if(t.rescued?.length)actRescueTrace.cells.add(t.cell);}return result;};
const beforeArtPresent=present;
present=async function(before,...args){
 if(regionalActive(state)){
  const old=before.hazards||{},now=state.hazards||{},newCells=new Set((now.crystals||[]).map(c=>c.cell));
  for(const c of old.crystals||[]){if(!newCells.has(c.cell))actArtFx(c.cell,now.stats?.crystalsBroken>old.stats?.crystalsBroken?'crystal-break':'neutral-clear');else if((now.crystals||[]).find(n=>n.cell===c.cell)?.layers<c.layers)actArtFx(c.cell,'crystal-hit');}
  if(actRescueTrace.owner===state&&actRescueTrace.move===state.moves)for(const cell of actRescueTrace.cells)actArtFx(cell,'crack-rescue');
  const panel=document.querySelector('.battle');
  if((state.poison?.stacks||0)!==(before.poison?.stacks||0)){const el=document.createElement('div');el.className='act-status-fx '+((state.poison?.stacks||0)>(before.poison?.stacks||0)?'poison-add':'poison-cleanse');el.textContent=(state.poison?.stacks||0)>(before.poison?.stacks||0)?'พิษ +':'ล้างพิษ';panel.append(el);setTimeout(()=>el.remove(),reduced?100:650);}
  if(now.bossPhase!==old.bossPhase&&now.bossPhase===2){const el=document.createElement('div');el.className='act-status-fx phase-transition';el.textContent='ผู้พิทักษ์ · เฟส 2';panel.append(el);setTimeout(()=>el.remove(),reduced?100:1000);}
 }
 return beforeArtPresent(before,...args);
};
