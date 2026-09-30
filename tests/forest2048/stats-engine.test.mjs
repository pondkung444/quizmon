import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { forestConfig, readForestStats } from '../../src/lib/forest2048/stats.ts';

const caps = { hp:90, atk:115, def:85, spd:115, foc:95 };
const pet = {stage:4,stat_hp:90,stat_atk:115,stat_def:85,stat_spd:115,stat_foc:95};
assert.deepEqual(readForestStats({...pet,equippedGear:[{stat:'atk',bonus:9999}]},caps),caps);
assert.ok(Math.abs(forestConfig(readForestStats(pet,caps)).attack-6.3)<1e-10);
for(const stage of [1,2,3]) assert.deepEqual(readForestStats({stage,stat_hp:null,stat_atk:null,stat_def:null,stat_spd:null,stat_foc:null},caps),{hp:50,atk:50,def:50,spd:50,foc:50});
assert.throws(()=>readForestStats({...pet,stat_hp:null},caps));
assert.throws(()=>readForestStats({...pet,stat_spd:NaN},caps));
assert.throws(()=>readForestStats({...pet,stat_def:-1},caps));
assert.throws(()=>readForestStats({...pet,stage:5},caps));
assert.deepEqual(readForestStats({...pet,stat_atk:9999},caps),caps);
assert.deepEqual(forestConfig({hp:50,atk:50,def:50,spd:50,foc:50}),{hp:100,attack:5,armor:8,heal:8,bonus:.15,cooldown:5,critChance:.05,critMultiplier:1.5});
for(let n=0;n<130;n++) {
  const config = forestConfig({hp:n,atk:n,def:n,spd:n,foc:n});
  const next = forestConfig({hp:n+1,atk:n+1,def:n+1,spd:n+1,foc:n+1});
  assert.ok(next.hp>=config.hp&&next.attack>=config.attack&&next.armor>=config.armor&&next.critChance>=config.critChance&&next.cooldown<=config.cooldown);
}
const context=vm.createContext({console,structuredClone});
vm.runInContext(readFileSync(new URL('../../public/2048/engine.js',import.meta.url),'utf8')+';globalThis.engine={slide,swipe,fresh,skill,BASE};',context);
const {fresh,swipe,skill,BASE}=context.engine;
function state(critChance=0){const s=fresh('math','mushroom',{...BASE,hp:100,enemyHp:1000,damage:12,interval:2,critChance,critMultiplier:1.5});s.board=Array(16).fill(null);s.board[0]={v:8,t:'a',f:0};s.board[1]={v:8,t:'a',f:0};return s;}
const ordinary=state(.05),critical=state(.05);
swipe(ordinary,'left',()=>.9);swipe(critical,'left',()=>0);
assert.equal(ordinary.enemyHp,985);assert.equal(critical.enemyHp,978);assert.equal(critical.lastCrit,true);
const shield=state(1);shield.board[0].t=shield.board[1].t='d';let rolls=0;
swipe(shield,'left',()=>{rolls++;return 0});assert.equal(rolls,3,'shield swipe only consumes spawn RNG, not critical RNG');assert.equal(shield.enemyHp,1000);
const empty=state(1);empty.board[1]=null;rolls=0;assert.equal(swipe(empty,'left',()=>{rolls++;return 0}),false);assert.equal(rolls,0);
const rooted=state(1);rooted.board[0].f=2;swipe(rooted,'left',()=>.9);assert.equal(rooted.board[0].f,1);assert.equal(rooted.enemyHp,1000);
const armored=state(0);armored.countdown=1;armored.armor=100;swipe(armored,'left',()=>.9);assert.equal(armored.hp,100);assert.equal(armored.armor,0);
for(const lane of ['math','science','balanced']){const s=state(0);s.hero=lane;s.charge=5;s.board[0].f=2;s.hp=50;assert.equal(skill(s),true);assert.equal(s.charge,0);if(lane==='science')assert.equal(s.board[0].f,0);if(lane==='balanced')assert.equal(s.hp,65);}
const beetle=state(1);beetle.enemy='beetle';swipe(beetle,'left',()=>0);assert.equal(beetle.enemyHp,989,'beetle stance applies after critical damage');
console.log('PASS: pet-only stats, stage fallback, missing data, caps, monotonic mapping, baseline, seeded criticals, no-op/root/armor/stance and temporary skills');
