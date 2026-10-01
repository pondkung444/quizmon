import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({assert,console,structuredClone,document:{},localStorage:{}});
vm.runInContext(['runes.js','engine.js','run.js'].map(f=>fs.readFileSync(new URL('../../public/2048/'+f,import.meta.url),'utf8')).join('\n')+`
let state;persist=()=>{};
function setup(relics){run={seed:1,relics,echo:false};state=fresh('math','mushroom',{...BASE,enemyHp:10000,damage:10,interval:20});state.board=Array(16).fill(null);state.board[0]={v:8,t:'a',f:0};state.board[1]={v:8,t:'a',f:0};}
setup(['echo']);run.echo=true;runSwipe('left');assert.equal(state.enemyHp,9978);assert.equal(state.cfg.attack,5);
setup(['shadow']);state.board[0].v=256;state.board[1]=null;state.charge=5;runSkill();assert.equal(state.board.filter(t=>t?.v===256).length,1);assert.equal(state.board.filter(t=>t?.v===16).length,1);
setup(['seed']);let fours=0;for(let i=0;i<1000;i++){state.status='playing';state.countdown=20;state.board=Array(16).fill(null);state.board[0]={v:2,t:'a',f:0};runSwipe('right');fours+=state.board.filter(t=>t?.v===4).length;}assert.ok(fours>280&&fours<420,'seed 35% approximate distribution');
setup(['thorn']);state.cfg.rune='egg4';state.board[0].t='x';state.armor=100;state.countdown=1;runeState(state).cold=2;runSwipe('left');assert.equal(state.lastAttack,null);assert.equal(state.enemyHp,10000,'freeze must not trigger a phantom thorn reflection');
setup(['echo']);state.cfg.rune='egg1';state.board[0].t='x';run.echo=true;runSwipe('left');const power=runeState(state).burn[0].power;assert.ok(power>6);state.cfg.attack=1;state.board=Array(16).fill(null);state.board[0]={v:2,t:'h',f:0};runSwipe('right');assert.equal(runeState(state).burn[0].power,power);
`,c);
console.log('PASS: reduced echo, bounded mirror, 35% seed distribution, freeze/thorn no phantom attack, frozen burn under echo');
