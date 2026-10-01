import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const storage=new Map(),nodes=new Map();
const c=vm.createContext({assert,console,structuredClone,document:{querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',replaceChildren(){}});return nodes.get(selector);}},localStorage:{setItem:(k,v)=>storage.set(k,v),getItem:k=>storage.get(k)??null}});
vm.runInContext(['runes.js','skills.js','engine.js','run.js','endless.js'].map(f=>fs.readFileSync(new URL('../../public/2048/'+f,import.meta.url),'utf8')).join('\n')+`
let state;let lastPanel;
panel=(title,text,choices)=>{lastPanel={title,text,choices};};hidePanel=updateImages=render=()=>{};
const companion={stage:4,eggPrefix:'egg1',lane:'math',personality:'A',config:{...BASE}};
function setup(room,enemy,endlessVersion=1){state=undefined;run={version:3,balanceVersion:3,endlessVersion,routeSeed:123,skillVersion:1,runeVersion:1,accountId:'fixture',companion,questions:QUESTIONS,hero:'math',seed:123,room,coins:0,relics:[],phase:'battle',revived:false,started:Date.now(),history:[]};enterBattle(enemy);}
for(const room of [1,2,3,4,5,8,9,10,12,16,17,80,160,161])for(const enemy of ['mushroom','beetle','slow_striker','glass_striker','brute','stag']){
 setup(room,enemy);const level=1+Math.floor((room-1)/8),local=1+(room-1)%8,base=ENEMY[enemy];
 assert.equal(state.cfg.enemyHp,Math.round((base.hp+(local>4&&enemy!=='stag'?20:0))*1.2**(level-1)));
 assert.equal(state.cfg.damage,Math.round((room<=2?({mushroom:10,beetle:13}[enemy]??base.damage):base.damage)*1.08**(level-1)));
 assert.equal(state.cfg.interval,base.interval);assert.equal(state.cfg.attack,BASE.attack);assert.equal(state.cfg.hp,BASE.hp);
 state.heavy=true;assert.equal(enemyDamage(state),Math.ceil(state.cfg.damage*1.5));
}
setup(8,'stag');state.status='won';state.hp=73;state.charge=2;state.board=Array(16).fill(null);state.board[0]={v:64,t:'a',f:0};state.board[1]={v:2,t:'a',f:0};run.revived=true;settleRun();assert.equal(run.phase,'doors');assert.equal(run.history.length,1);assert.ok(run.doors.every(t=>['mushroom','beetle','slow_striker','glass_striker'].includes(t)));enterDoor(run.doors[0]);assert.equal(run.room,9);assert.equal(state.hp,73);assert.equal(state.charge,2);assert.equal(run.revived,true);assert.ok(state.board.some(t=>t?.v===64));
const saved=savedRun(saveKey());assert.equal(saved.room,9);restoreRun(saved);assert.equal(run.room,9);assert.equal(state.hp,73);assert.equal(run.endlessVersion,1);
const route=endlessDoors(161);run.seed=999;assert.deepEqual(endlessDoors(161),route);assert.deepEqual(endlessDoors(164),['brute']);assert.deepEqual(endlessDoors(168),['stag']);
run.relics=['echo','shadow','seed','spark','thorn','root'];assert.equal(has('echo'),false);assert.deepEqual(offers(),[]);run.phase='relic';run.offers=['echo'];chooseRelic('echo');assert.equal(run.relics.length,6);showPhase();assert.equal(run.phase,'doors');
run.phase='shop';showPhase();assert.equal(lastPanel.choices.length,1);lastPanel.choices[0].action();assert.equal(run.phase,'doors');
run.phase='quizReward';run.quizPassed=true;showPhase();assert.equal(lastPanel.choices.length,1);lastPanel.choices[0].action();assert.equal(run.phase,'doors');
state.status='lost';run.phase='battle';run.revived=true;settleRun();assert.equal(run.phase,'failed');assert.ok(lastPanel.text.includes('ระยะทาง 9'));
setup(8,'stag',null);state.status='won';settleRun();assert.equal(run.phase,'complete');
setup(2,'mushroom',null);state.status='won';settleRun();assert.equal(run.phase,'relic');assert.equal(run.offers.length,3);
forestAccount={accountId:'fixture'};forestRequest=async()=>({accountId:'fixture',companion,questions:QUESTIONS});
`,c);
await vm.runInContext("startRun('fixture')",c);
assert.equal(vm.runInContext('run.endlessVersion',c),1);
assert.equal(vm.runInContext('run.routeSeed===run.seed || Number.isInteger(run.routeSeed)',c),true);
console.log('PASS: growth boundaries, six species, no relic effects/offers/purchases, boss continuation/carry, save beyond room8, deterministic routes, utility rooms, single revive and legacy saves');
