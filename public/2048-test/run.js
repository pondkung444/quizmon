'use strict';
const SAVE='quizmon-forest-run-v1';
const RELICS=[
 {id:'echo',name:'เสียงสะท้อน',desc:'ปัดที่ไม่รวมรูนจะเตรียมเสียงสะท้อน: การรวมครั้งถัดไปให้พลังทุกชนิดสองเท่า'},
 {id:'shadow',name:'กระจกคู่หู',desc:'หลังใช้สกิล คัดลอกรูนเลขสูงสุดไปยังช่องว่างหนึ่งช่อง ไม่ปล่อยพลังทันที'},
 {id:'fate',name:'วงแหวนสลับชะตา',desc:'หลังศัตรูโจมตี รูนดาบและรูนโล่ทั้งหมดสลับชนิดกัน เลขและรากคงเดิม'},
 {id:'heart',name:'หัวใจแห่งป่า',desc:'รูนที่เกิดใหม่ทุกช่องเป็นฮีล การรวมดาบและโล่ยังทำงานตามปกติ'},
 {id:'spark',name:'สายฟ้าคู่หู',desc:'เมื่อรวมอย่างน้อยสองคู่ในปัดเดียว ชาร์จสกิลเพิ่มอีกหนึ่งหน่วย'},
 {id:'seed',name:'เมล็ดคู่แฝด',desc:'รูนเกิดใหม่เป็นเลข 4 เสมอแทนเลข 2 เป็นหลัก'},
 {id:'thorn',name:'หนามสะท้อน',desc:'เมื่อเกราะรับการโจมตีได้ทั้งหมด สะท้อนพลังโจมตีนั้นกลับใส่ศัตรู (ผ่านท่าตั้งรับของด้วง)'},
 {id:'root',name:'แหวนคลายราก',desc:'รูนที่ศัตรูพันรากเหลือรากเพียงหนึ่งชั้น ชนหนึ่งครั้งจะคลาย แต่ยังรวมได้ในปัดถัดไป'}
];
const QUESTIONS=[
 ['7 × 8 เท่ากับเท่าไร?',['54','56','64'],1],['น้ำแข็งละลายกลายเป็นอะไร?',['น้ำ','ไอน้ำทันที','ดิน'],0],
 ['ครึ่งหนึ่งของ 90 คือเท่าไร?',['30','45','60'],1],['พืชใช้ส่วนใดดูดน้ำจากดิน?',['ดอก','ใบ','ราก'],2],
 ['15 + 27 เท่ากับเท่าไร?',['42','32','52'],0],['ดาวเคราะห์ที่เราอาศัยอยู่คืออะไร?',['ดาวอังคาร','โลก','ดาวศุกร์'],1],
 ['รูปสามเหลี่ยมมีด้านกี่ด้าน?',['3','4','5'],0],['สัตว์ชนิดใดเป็นสัตว์เลี้ยงลูกด้วยนม?',['ปลา','กบ','โลมา'],2],
 ['100 − 36 เท่ากับเท่าไร?',['74','64','66'],1],['สิ่งใดเป็นแหล่งแสงตามธรรมชาติ?',['ดวงอาทิตย์','กระจก','ก้อนหิน'],0],
 ['หนึ่งชั่วโมงมีกี่นาที?',['30','60','100'],1],['ออกซิเจนจำเป็นสำหรับอะไร?',['การหายใจ','การเปลี่ยนสี','การนับเลข'],0]
];
let run=null;
function rng(){run.seed=(Math.imul(run.seed,1664525)+1013904223)>>>0;return run.seed/4294967296;}
function has(id){return run.relics.includes(id);}
function offers(n=3){const pool=RELICS.filter(r=>!has(r.id));for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,n).map(r=>r.id);}
function persist(){if(!run)return;run.battle=state;try{localStorage.setItem(SAVE,JSON.stringify(run));}catch{document.querySelector('#message').textContent+=' · เครื่องนี้บันทึกความคืบหน้าไม่ได้';}}
function panel(title,text,choices){const target=document.querySelector('#run-content');target.replaceChildren();const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=text;target.append(h,p);for(const c of choices){const b=document.createElement('button');b.className='choice';b.disabled=!!c.disabled;const strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=c.title;span.textContent=c.desc||'';b.append(strong,span);b.onclick=c.action;target.append(b);}document.querySelector('#run-panel').hidden=false;document.querySelector('main').inert=true;target.querySelector('button:not(:disabled)')?.focus();}
function hidePanel(){document.querySelector('#run-panel').hidden=true;document.querySelector('main').inert=false;}
function runHUD(){if(!run)return;document.querySelector('#run-hud').textContent=`ห้อง ${run.room} / 8 · ${run.coins} เหรียญ · ช่วยชีวิต ${run.revived?'ใช้แล้ว':'เหลือ 1 ครั้ง'}`;document.querySelector('#relics').textContent='✦ '+(run.relics.map(id=>RELICS.find(r=>r.id===id).name).join(' · ')||'ยังไม่มี relic');}
function showNewRun(){panel('ออกสำรวจป่าผลึก','เลือกคู่หูสำหรับบททดสอบ 8 ห้อง ใช้ค่าสเตตัสทดลองเหมือนกันทุกตัว ควิซเป็นชุดตัวอย่าง ไม่เปลี่ยนข้อมูลการเรียนในบัญชี',[
 ...Object.keys(HERO).map(hero=>({title:HERO[hero].name,desc:HERO[hero].desc,action:()=>startRun(hero)})),
 ...(run?[{title:'กลับไปการเดินทางเดิม',action:()=>showPhase()}]:[])
 ]);}
function initRun(){try{const saved=JSON.parse(localStorage.getItem(SAVE));if(saved&&saved.version===1&&saved.battle&&saved.room>=1&&saved.room<=8){run=saved;state=run.battle;updateImages();render();showPhase();return;}}catch{}showNewRun();}
function startRun(hero){run={version:1,hero,seed:(Date.now()>>>0),room:1,coins:0,relics:[],phase:'battle',revived:false,echo:false,started:Date.now(),history:[]};enterBattle('mushroom');}
function cleanBoard(){const board=state.board.map(t=>t?{...t,f:0}:null);const ids=board.map((t,i)=>t?i:null).filter(i=>i!==null).sort((a,b)=>board[a].v-board[b].v||a-b);ids.slice(0,Math.ceil(ids.length/2)).forEach(i=>board[i]=null);return board;}
function enterBattle(enemy){const previous=state&&run.room>1?state:null;const cfg={...BASE,enemyHp:ENEMY[enemy].hp+(run.room>4&&enemy!=='stag'?20:0),damage:ENEMY[enemy].damage,interval:ENEMY[enemy].interval};state=fresh(run.hero,enemy,cfg);state.board=previous?cleanFrom(previous.board):Array(16).fill(null);if(previous)state.hp=previous.hp;while(state.board.filter(Boolean).length<2)spawn(state,rng);state.armor=0;run.phase='battle';run.echo=false;hidePanel();updateImages();render();persist();}
function cleanFrom(board){const copy=board.map(t=>t?{...t,f:0}:null);const ids=copy.map((t,i)=>t?i:null).filter(i=>i!==null).sort((a,b)=>copy[a].v-copy[b].v||a-b);ids.slice(0,Math.ceil(ids.length/2)).forEach(i=>copy[i]=null);return copy;}
function runSwipe(dir){const preview=slide(state.board,dir);const before=structuredClone(state);const boosts=has('echo')&&run.echo&&preview.merges.length;const original={attack:state.cfg.attack,armor:state.cfg.armor,heal:state.cfg.heal};if(boosts)for(const key of Object.keys(original))state.cfg[key]*=2;const changed=swipe(state,dir,rng);Object.assign(state.cfg,original);if(!changed)return;
 if(has('echo'))run.echo=preview.merges.length?false:true;
 if(has('spark')&&preview.merges.length>=2)state.charge=Math.min(state.cfg.cooldown,state.charge+1);
 if(before.countdown===1&&state.enemyHp>0){if(has('fate'))state.board.forEach(t=>{if(t&&t.t!=='h')t.t=t.t==='a'?'d':'a';});if(has('thorn')&&state.lastAttack?.damage===0){state.enemyHp=Math.max(0,state.enemyHp-state.lastAttack.power);finish(state);}}
 state.board.forEach((t,i)=>{if(t&&!preview.board[i]){if(has('heart'))t.t='h';if(has('seed'))t.v=4;}if(t?.f===2&&has('root')&&!preview.board[i]?.f)t.f=1;});
 if(preview.hits.length)log(state,'🌿 ชนราก '+preview.hits.length+' รูน • เลขเดิม ไม่รวม ไม่ปล่อยพลัง');persist();}
function runSkill(){if(!skill(state))return;if(has('shadow')){const tiles=state.board.filter(Boolean).sort((a,b)=>b.v-a.v);const empty=state.board.map((t,i)=>t?null:i).filter(i=>i!==null);if(tiles.length&&empty.length){state.board[empty[Math.floor(rng()*empty.length)]]={...tiles[0],f:0};log(state,'✦ กระจกคู่หูคัดลอกรูนใหญ่สุด');}}persist();}
function settleRun(){if(!run||run.phase!=='battle')return;if(state.status==='won'){run.coins+=run.room===4?45:20;run.history.push({room:run.room,type:state.enemy,moves:state.moves,hp:state.hp});if(run.room===8){run.phase='complete';persist();showPhase();return;}if(run.room===2||run.room===4){run.phase='relic';run.offers=offers();}else makeDoors();persist();showPhase();}else if(state.status==='lost'){if(!run.revived){run.phase='revivePrompt';}else run.phase='failed';persist();showPhase();}}
function makeDoors(){run.phase='doors';const next=run.room+1;if(next===4||next===8){run.doors=[next===4?'brute':'stag'];return;}if(next<=3){run.doors=['mushroom','beetle'];return;}const types=['mushroom','beetle','rest','shop','quiz'];const first=types[Math.floor(rng()*types.length)];const second=types.filter(t=>t!==first);run.doors=[first,second[Math.floor(rng()*second.length)]];}
const DOORS={mushroom:['เห็ดผลึก','โจมตีเบาและถี่ · ชนะรับ 20 เหรียญ'],beetle:['ด้วงแก้ว','สลับตั้งรับกับพุ่งชน · ชนะรับ 20 เหรียญ'],brute:['โกเล็มหินผลึก','ห้องแกร่ง · หมัดหนักสลับหมัดปกติ · รับ 45 เหรียญและเลือก relic'],stag:['กวางเทพพิทักษ์','บททดสอบสุดท้าย · พันรากรูน ชน 2 ครั้งเพื่อคลาย'],rest:['บ่อน้ำพักใจ','ฟื้น HP 30% ของเลือดสูงสุด · ใช้หนึ่งห้อง'],shop:['ร้านนักเดินทาง','ซื้อ relic ด้วย 40 เหรียญ · ใช้หนึ่งห้อง'],quiz:['ศิลาความรู้','ตอบหนึ่งข้อ รับ relic หรือ 25 เหรียญ · ตอบผิดไม่มีโทษ']};
function enterDoor(type){if(run.phase!=='doors'||!run.doors.includes(type))return;run.room++;if(ENEMY[type]){enterBattle(type);return;}state.board=cleanFrom(state.board);state.armor=0;run.phase=type;run.echo=false;if(type==='shop')run.offers=offers();if(type==='quiz')beginQuiz(false);persist();showPhase();}
function completeUtility(){run.history.push({room:run.room,type:run.phase,hp:state.hp});makeDoors();persist();showPhase();}
function chooseRelic(id){if(run.phase!=='relic'||!run.offers.includes(id)||has(id))return;run.relics.push(id);makeDoors();persist();showPhase();}
function beginQuiz(revive){run.phase=revive?'reviveQuiz':'quiz';const ids=QUESTIONS.map((_,i)=>i);for(let i=ids.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}run.quiz={ids:ids.slice(0,revive?3:1),index:0,correct:0};persist();}
function answer(index){if(!['quiz','reviveQuiz'].includes(run.phase))return;const q=QUESTIONS[run.quiz.ids[run.quiz.index]];if(index===q[2])run.quiz.correct++;run.quiz.index++;if(run.quiz.index<run.quiz.ids.length){persist();showPhase();return;}if(run.phase==='reviveQuiz'){if(run.quiz.correct===3){state.hp=Math.ceil(state.cfg.hp*.3);state.status='playing';state.ended=0;run.phase='battle';state.feedback='ศิลาความรู้ช่วยฟื้น HP 30% · ไปต่อด้วยกัน';hidePanel();render();}else run.phase='failed';}else{run.quizPassed=run.quiz.correct===1;run.phase='quizReward';}persist();showPhase();}
function showPhase(){if(!run){showNewRun();return;}runHUD();const phase=run.phase;if(phase==='battle'){hidePanel();render();return;}
 if(phase==='doors'){panel('เลือกเส้นทาง · ห้อง '+(run.room+1),`HP ${state.hp}/${state.cfg.hp} · ${run.coins} เหรียญ · เมื่อข้ามห้อง เกราะเป็น 0 ล้างรูนต่ำสุดครึ่งหนึ่งและคลายรากทั้งหมด`,run.doors.map(type=>({title:DOORS[type][0],desc:DOORS[type][1],action:()=>enterDoor(type)})));}
 else if(phase==='relic'){panel('เลือก relic หนึ่งชิ้น','พลังนี้อยู่กับคู่หูตลอดการเดินทาง',run.offers.length?run.offers.map(id=>{const r=RELICS.find(r=>r.id===id);return{title:r.name,desc:r.desc,action:()=>chooseRelic(id)};}):[{title:'รับ 25 เหรียญแทน',action:()=>{run.coins+=25;makeDoors();persist();showPhase();}}]);}
 else if(phase==='rest'){panel('บ่อน้ำพักใจ',`HP ${state.hp}/${state.cfg.hp} · ฟื้นได้ ${Math.min(state.cfg.hp-state.hp,Math.ceil(state.cfg.hp*.3))}`, [{title:'พักกับคู่หู',action:()=>{state.hp=Math.min(state.cfg.hp,state.hp+Math.ceil(state.cfg.hp*.3));completeUtility();}}]);}
 else if(phase==='shop'){panel('ร้านนักเดินทาง',`${run.coins} เหรียญ · relic ชิ้นละ 40 เหรียญ`,[...run.offers.filter(id=>!has(id)).map(id=>{const r=RELICS.find(r=>r.id===id);return{title:r.name+' · 40 เหรียญ',desc:r.desc,disabled:run.coins<40,action:()=>{if(run.phase!=='shop'||run.coins<40||has(id))return;run.coins-=40;run.relics.push(id);persist();showPhase();}};}),{title:'เดินทางต่อ',action:completeUtility}]);}
 else if(phase==='revivePrompt'){panel('คู่หูต้องพักแล้ว','ยังมีโอกาสช่วยชีวิตครั้งเดียว: ตอบควิซ 3 ข้อถูกครบ ฟื้น HP 30%', [{title:'ลองควิซช่วยชีวิต',action:()=>{run.revived=true;beginQuiz(true);showPhase();}},{title:'จบการเดินทางครั้งนี้',action:()=>{run.phase='failed';persist();showPhase();}}]);}
 else if(phase==='quiz'||phase==='reviveQuiz'){const q=QUESTIONS[run.quiz.ids[run.quiz.index]];panel(phase==='quiz'?'ศิลาความรู้':`ช่วยชีวิต · ข้อ ${run.quiz.index+1}/3`,q[0],q[1].map((text,i)=>({title:text,action:()=>answer(i)})));}
 else if(phase==='quizReward'){panel(run.quizPassed?'ศิลาส่องแสงตอบรับ':'ได้เรียนรู้อีกหนึ่งเรื่อง',run.quizPassed?'เลือกของขวัญสำหรับการเดินทาง':'ไม่มีบทลงโทษ ไปสำรวจต่อด้วยกัน',run.quizPassed?[{title:'เลือก relic 1 จาก 3',action:()=>{run.history.push({room:run.room,type:'quiz',hp:state.hp});run.phase='relic';run.offers=offers();persist();showPhase();}},{title:'รับ 25 เหรียญ',action:()=>{run.coins+=25;completeUtility();}}]:[{title:'เดินทางต่อ',action:completeUtility}]);}
 else if(phase==='complete'||phase==='failed'){panel(phase==='complete'?'กวางเทพพิทักษ์ยอมรับเราแล้ว':'เราจะกลับมาสำรวจด้วยกันอีก',`ผ่าน ${run.history.length} ห้อง · ${run.relics.length} relic · ${run.coins} เหรียญ · ${Math.floor((Date.now()-run.started)/60000)} นาที`,[{title:'เริ่มการเดินทางใหม่',action:showNewRun}]);}
}
