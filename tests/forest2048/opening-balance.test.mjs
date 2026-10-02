import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({assert,console,structuredClone,document:{}});
vm.runInContext(['runes.js','skills.js','engine.js','run.js','endless.js','relics.js','relic-engine.js','relic-run.js'].map(f=>fs.readFileSync('public/2048/'+f,'utf8')).join('\n')+`
let state;panel=hidePanel=updateImages=render=runHUD=persist=showPhase=()=>{};
const companion={stage:4,eggPrefix:'egg1',lane:'science',personality:'A',config:{...BASE,hp:116}};
function setup(version,room,enemy){state=undefined;run={version:3,balanceVersion:version,endlessVersion:1,relicVersion:1,runeVersion:1,skillVersion:1,companion,questions:QUESTIONS,hero:'science',seed:123,routeSeed:123,room,coins:0,relics:[],phase:'battle',revived:false,history:[]};enterBattle(enemy);}
for(const version of [3,4]){
 setup(version,3,'beetle');assert.equal(state.cfg.damage,version===4?13:16);
 for(let seed=1;seed<100;seed++){run.routeSeed=seed;if(version===4)assert.ok(endlessDoors(3).every(e=>['mushroom','beetle'].includes(e)));assert.deepEqual(endlessDoors(4),['brute']);}
 setup(version,4,'brute');assert.equal(state.cfg.enemyHp,version===4?150:190);assert.equal(state.cfg.damage,version===4?18:25);state.heavy=true;assert.equal(enemyDamage(state),version===4?27:38);
 setup(version,12,'brute');assert.equal(state.cfg.enemyHp,228);assert.equal(state.cfg.damage,27);
 for(const room of [1,2,3,4,9]){setup(version,room,'mushroom');state.hp=30;state.status='won';settleRun();assert.equal(state.hp,version===4&&room<=3?54:30);assert.equal(run.history[0].hp,state.hp);const hp=state.hp;settleRun();assert.equal(state.hp,hp,'repeated settle must not heal twice');}
 setup(version,2,'mushroom');state.hp=110;state.status='won';settleRun();assert.equal(state.hp,version===4?116:110);
 setup(version,2,'mushroom');state.hp=0;state.status='lost';settleRun();assert.equal(state.hp,0);assert.equal(run.phase,'revivePrompt');
}
// Restore after a reward: recovery is already recorded and does not repeat on entering the next room.
setup(4,2,'mushroom');state.hp=30;state.status='won';settleRun();const checkpoint=structuredClone({run,state});run=checkpoint.run;state=checkpoint.state;chooseRelic(run.offers[0]);enterDoor(run.doors[0]);assert.equal(state.hp,54);assert.equal(run.room,3);
console.log('PASS: v4 opening, v3 compatibility, later cycles unchanged, recovery caps and checkpoint carry');
`,c);
