import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({console,structuredClone});
vm.runInContext(fs.readFileSync(new URL('../../public/2048/runes.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../../public/2048/engine.js',import.meta.url),'utf8')+';globalThis.e={fresh,swipe,slide,BASE,runeState,awakenRune,convertRune,consumeRuneStacks,ENEMY};',c);
const {fresh,swipe,slide,BASE,runeState,ENEMY}=c.e;
function s(egg='egg1',value=8){const a=fresh('math','mushroom',{...BASE,rune:egg,enemyHp:10000,damage:10,interval:20,critChance:0});a.board=Array(16).fill(null);a.board[0]={v:value,t:'x',f:0};a.board[1]={v:value,t:'a',f:0};a.hp=50;return a;}
function pair(a,value=8){a.board=Array(16).fill(null);a.board[0]={v:value,t:'x',f:0};a.board[1]={v:value,t:'a',f:0};}
const fire=s();swipe(fire,'left',()=>.9);assert.equal(fire.enemyHp,9991);assert.equal(runeState(fire).burn.length,1);pair(fire,16);swipe(fire,'left',()=>.9);assert.equal(runeState(fire).burn.length,2);assert.deepEqual(Array.from(runeState(fire).burn,g=>g.remaining),[1,2]);
const locked=runeState(fire).burn.map(g=>g.power);fire.cfg.attack=100;fire.board=Array(16).fill(null);fire.board[0]={v:2,t:'h',f:0};swipe(fire,'right',()=>.9);assert.equal(runeState(fire).burn.length,1);assert.equal(runeState(fire).burn[0].power,locked[1]);
const noOp=s();noOp.board[1]=null;const seed={id:1,power:10,remaining:2};runeState(noOp).burn.push(seed);assert.equal(swipe(noOp,'left',()=>.9),false);assert.equal(seed.remaining,2);
const wood=s('egg2');swipe(wood,'left',()=>.9);assert.equal(wood.armor,16);assert.equal(wood.hp,50);wood.board=Array(16).fill(null);wood.board[0]={v:2,t:'a',f:0};swipe(wood,'right',()=>.9);assert.equal(wood.hp,54);
const ice=s('egg4');ice.countdown=1;runeState(ice).cold=2;swipe(ice,'left',()=>.9);assert.equal(ice.lastAttack,null);assert.equal(ice.countdown,1);assert.equal(runeState(ice).cold,0);
const sky=s('egg5');sky.charge=0;runeState(sky).spark=1;swipe(sky,'left',()=>.9);assert.equal(sky.charge,2);assert.equal(runeState(sky).spark,0);
const ready=s('egg5');ready.charge=5;runeState(ready).spark=1;swipe(ready,'left',()=>.9);assert.equal(runeState(ready).spark,2);
const earth=s('egg6');earth.countdown=1;swipe(earth,'left',()=>.9);assert.equal(earth.armor,0);assert.equal(earth.hp,50);assert.equal(earth.enemyHp,9990);assert.equal(runeState(earth).quake.length,0);
const dead=s('egg6');dead.countdown=1;dead.hp=1;dead.cfg.damage=100;swipe(dead,'left',()=>.9);assert.equal(dead.status,'lost');assert.equal(dead.enemyHp,10000);
const divine=s('egg3');swipe(divine,'left',()=>.9);assert.equal(divine.board[0].awake,false);assert.equal(divine.enemyHp,9985);
const both=s('egg3');both.board[1].t='x';swipe(both,'left',()=>.9);assert.equal(both.board[0].awake,true);assert.equal(both.enemyHp,9970);
const threshold=s('egg3',32);swipe(threshold,'left',()=>.9);assert.equal(threshold.board[0].awake,true);
const carry=Array(16).fill(null);carry[0]={v:8,t:'x',awake:true,f:0};carry[1]={v:8,t:'a',f:0};assert.equal(slide(carry,'left','egg3').board[0].awake,true);assert.equal(slide(carry,'right','egg3').board[3].t,'a');assert.equal(slide(carry,'right','egg3').board[3].awake,undefined);
const roots=s('egg3');roots.board[0].f=2;swipe(roots,'left',()=>.9);assert.equal(roots.board[0].f,1);assert.equal(roots.enemyHp,10000);
// Large carried sword is valuable, but one 256 merge no longer erases the boss.
const boss=s(undefined,128);boss.enemy='stag';boss.cfg.enemyHp=ENEMY.stag.hp;boss.enemyHp=ENEMY.stag.hp;boss.board[0].t='a';swipe(boss,'left',()=>.9);assert.equal(boss.status,'playing');assert.ok(boss.enemyHp>1000);
console.log('PASS: 6 rune families, stacks/expiry/no-op, freeze timing, charge cap, lethal/counter, awakening/mixed direction/root, large-tile boss survives');
