import fs from 'node:fs';
import vm from 'node:vm';
// Anonymous gameplay configurations copied from pilot checkpoints; no account or pet IDs.
const profiles=[
 ['egg1',4,'science','A',116,4.4,7.48,4,.07],
 ['egg1',4,'math','B',88,6.3,7.28,5,.07],
 ['egg3',4,'math','B',100,5.16,9.28,5,.075],
 ['egg4',4,'science','B',124,4.18,6.64,5,.065],
 ['egg5',4,'science','B',112,5.1,9.2,5,.056],
 ['egg6',4,'science','A',104,4.86,8.28,5,.059],
].map(([eggPrefix,stage,lane,personality,hp,attack,armor,cooldown,critChance])=>({eggPrefix,stage,lane,personality,config:{hp,attack,armor,cooldown,critChance,critMultiplier:1.5,heal:8,bonus:.15}}));
const c=vm.createContext({console,structuredClone,profiles});
const source=['runes.js','skills.js','engine.js','run.js','endless.js','relics.js','relic-engine.js','relic-run.js'].map(f=>fs.readFileSync('public/2048/'+f,'utf8')).join('\n');
const result=vm.runInContext(source+`
let state;panel=hidePanel=updateImages=render=runHUD=persist=showPhase=()=>{};
const results=[];
for(const companion of profiles)for(const balanceVersion of [3,4])for(let sample=1;sample<=20;sample++){
 const seed=sample*7919;run={version:3,balanceVersion,endlessVersion:1,relicVersion:1,runeVersion:1,skillVersion:1,companion,questions:QUESTIONS,hero:companion.lane,seed,routeSeed:seed,room:1,coins:0,relics:[],phase:'battle',revived:false,history:[]};state=undefined;enterBattle('mushroom');
 for(let step=0;step<1000&&run.room<=8&&!['failed','ended'].includes(run.phase);step++){
  if(run.phase==='battle'){
   const original={run:structuredClone(run),state:structuredClone(state)};let best=null,score=-Infinity;
   for(const dir of DIRS){run=structuredClone(original.run);state=structuredClone(original.state);const moves=state.moves;runSwipe(dir);if(state.moves===moves)continue;
    const s=(original.state.enemyHp-state.enemyHp)*3+(state.hp-original.state.hp)*2+state.armor+(16-state.board.filter(Boolean).length)*2+(state.status==='won'?1000:state.status==='lost'?-1000:0);
    if(s>score){score=s;best={run:structuredClone(run),state:structuredClone(state)};}
   }if(!best)break;run=best.run;state=best.state;settleRun();
  }else if(run.phase==='doors'){const options=run.doors;const priority=['rest','mushroom','glass_striker','beetle','slow_striker','quiz','shop','brute','stag'];enterDoor(priority.find(t=>options.includes(t)));}
  else if(run.phase==='relic'){if(run.offers.length)chooseRelic(run.offers[0]);else makeDoors();}
  else if(run.phase==='revivePrompt'){run.revived=true;beginQuiz(true);}
  else if(['reviveQuiz','quiz'].includes(run.phase))answer(questionBank()[run.quiz.ids[run.quiz.index]][2]);
  else if(run.phase==='rest'){state.hp=Math.min(state.cfg.hp,state.hp+Math.ceil(state.cfg.hp*.3));completeUtility();}
  else if(['shop','quizReward'].includes(run.phase))completeUtility();else break;
 }
 results.push({egg:companion.eggPrefix,lane:companion.lane,version:balanceVersion,seed,rooms:Math.max(0,...run.history.map(h=>h.room)),revived:run.revived});
}
results;
`,c,{timeout:180000});
const summary=profiles.flatMap(p=>[3,4].map(version=>{const rows=result.filter(r=>r.egg===p.eggPrefix&&r.lane===p.lane&&r.version===version);return{egg:p.eggPrefix,lane:p.lane,version,runs:rows.length,passed3:rows.filter(r=>r.rooms>=3).length,passed4:rows.filter(r=>r.rooms>=4).length,passed8:rows.filter(r=>r.rooms>=8).length,median:rows.map(r=>r.rooms).sort((a,b)=>a-b)[Math.floor(rows.length/2)]};}));
console.log(JSON.stringify(summary,null,2));
fs.mkdirSync('output/endless-competition',{recursive:true});fs.writeFileSync('output/endless-competition/opening-balance.json',JSON.stringify({policy:'Greedy one-turn bot; first relic; easier enemy; correct revival answers; 20 paired seeds per anonymous profile; capped after room 8. Rest heals 30% exactly as in the game; utility rooms count normally.',summary,result},null,2));
