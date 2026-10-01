import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const storage = new Map();
const context = vm.createContext({ assert, console, structuredClone, document: {}, localStorage: { setItem: (key,value)=>storage.set(key,value), getItem:key=>storage.get(key)??null } });
vm.runInContext(['runes.js','skills.js','engine.js','run.js'].map(file=>fs.readFileSync(new URL('../../public/2048/'+file,import.meta.url),'utf8')).join('\n')+`
let state;
for(const name of ['panel','hidePanel','updateImages','render','showPhase'])globalThis[name]=()=>{};
const companion={stage:4,eggPrefix:'egg1',lane:'math',personality:'A',config:{...BASE,critChance:.05,critMultiplier:1.5}};
function setup(balanceVersion,room,enemy){state=undefined;run={version:3,balanceVersion,skillVersion:1,runeVersion:1,accountId:'fixture',companion,questions:QUESTIONS,hero:'math',seed:1,room,coins:0,relics:[],phase:'battle',revived:false};enterBattle(enemy);}
for(const balanceVersion of [undefined,1,2,3])for(let room=1;room<=8;room++)for(const enemy of ['mushroom','beetle','brute','stag']){
  setup(balanceVersion,room,enemy);
  const expected=balanceVersion===3&&room<=2&&['mushroom','beetle'].includes(enemy)?({mushroom:10,beetle:13}[enemy]):ENEMY[enemy].damage;
  assert.equal(state.cfg.damage,expected,JSON.stringify({balanceVersion,room,enemy}));
  assert.equal(state.cfg.interval,ENEMY[enemy].interval);
  assert.equal(state.cfg.enemyHp,ENEMY[enemy].hp+(room>4&&enemy!=='stag'?20:0));
  assert.equal(state.cfg.attack,BASE.attack);assert.equal(state.cfg.armor,BASE.armor);assert.equal(state.cfg.hp,BASE.hp);
  assert.equal(state.cfg.autoSkill.index,0);
  assert.equal(enemyDamage(state),expected);state.heavy=true;assert.equal(enemyDamage(state),Math.ceil(expected*1.5));
}
setup(3,1,'mushroom');const current=savedRun(saveKey());restoreRun(current);assert.equal(state.cfg.damage,10);run.room=3;enterBattle('mushroom');assert.equal(state.cfg.damage,12);
setup(2,1,'mushroom');const old=savedRun(saveKey());restoreRun(old);assert.equal(state.cfg.damage,12);run.room=2;enterBattle('beetle');assert.equal(state.cfg.damage,16);
setup(3,2,'beetle');state.hp=73;state.charge=3;state.board=Array(16).fill(null);state.board[0]={v:64,t:'x',f:0};state.board[1]={v:2,t:'a',f:0};run.room=3;enterBattle('mushroom');assert.equal(state.cfg.damage,12);assert.equal(state.hp,73);assert.equal(state.charge,3);assert.ok(state.board.some(t=>t?.v===64));
forestAccount={accountId:'fixture'};forestRequest=async()=>({accountId:'fixture',companion,questions:QUESTIONS});
`,context);
await vm.runInContext("startRun('fixture')",context);
assert.equal(vm.runInContext('run.balanceVersion',context),3);
assert.equal(vm.runInContext('state.cfg.damage',context),10);
console.log('PASS: new-run v3, all room/enemy/version boundaries, normal/heavy damage, stats/skills/HP/interval unchanged, saved-run compatibility and board/charge carry');
