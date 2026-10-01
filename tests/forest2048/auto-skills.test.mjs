import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({assert,console,structuredClone,document:{},localStorage:{}});
vm.runInContext(['runes.js','skills.js','engine.js','run.js'].map(f=>fs.readFileSync(new URL('../../public/2048/'+f,import.meta.url),'utf8')).join('\n')+`
let state;persist=()=>{};
function setup(egg='egg1',index=0){const s=fresh('math','mushroom',{...BASE,skillVersion:1,autoSkill:{egg,index},rune:egg,enemyHp:100000,damage:10,interval:100,critChance:0});s.board=Array(16).fill(null);s.board[0]={v:8,t:'a',f:0};s.board[1]={v:8,t:'d',f:0};s.board[4]={v:8,t:'x',f:0};s.board[5]={v:8,t:'x',f:0};s.hp=50;return s;}
function quiet(s){s.board=Array(16).fill(null);s.board[0]={v:2,t:'h',f:0};}
for(const egg of Object.keys(AUTO_SKILLS))for(let index=0;index<6;index++){
 const s=setup(egg,index);s.charge=5;assert.equal(autoCast(s,()=>.6),true,egg+index);assert.equal(s.charge,0);assert.equal(autoState(s).serial,1);assert.ok(Number.isFinite(s.hp)&&s.hp>=0&&s.hp<=s.cfg.hp);assert.ok(Number.isFinite(s.enemyHp)&&Number.isFinite(s.armor));assert.equal(skill(s),false);
 const copy=JSON.parse(JSON.stringify(s));assert.deepEqual(JSON.stringify(copy.auto),JSON.stringify(s.auto));quiet(copy);swipe(copy,'right',()=>.9);assert.ok(Number.isFinite(copy.hp));
}
const p=autoPower(setup());
const direct=setup('egg1',3);direct.cfg.skillBase={...direct.cfg};direct.cfg.attack*=100;direct.charge=5;autoCast(direct);assert.equal(100000-direct.enemyHp,Math.floor(.9*p.a),'direct ignores echo and crit');
for(let i=0;i<16;i++){const s=setup('egg6',0);s.board=Array(16).fill(null);s.charge=5;autoCast(s,()=>(i+.1)/16);assert.equal(s.auto.mark.cell,i,'random supports every empty socket');s.charge=5;autoCast(s,()=>.99);assert.equal(s.auto.mark.cell,i,'no replacement');}
const noOp=setup('egg1',2);noOp.charge=5;autoCast(noOp);quiet(noOp);const snap=JSON.stringify(noOp);assert.equal(swipe(noOp,'left'),false);assert.equal(noOp.auto.buffs.burn.remaining,3);assert.equal(noOp.charge,0);
const burn=setup('egg1',2);burn.charge=5;autoCast(burn);assert.equal(burn.enemyHp,100000);for(let i=0;i<3;i++){quiet(burn);swipe(burn,'right',()=>.9);}assert.equal(100000-burn.enemyHp,3*Math.floor(p.a*.25));assert.equal(burn.auto.buffs.burn,undefined);
const early=setup('egg1',3);early.charge=4;early.countdown=1;swipe(early,'left',()=>.9);assert.equal(early.auto.serial,1);assert.ok(early.lastAttack,'Auto precedes attack');
const dead=setup('egg1',3);dead.charge=4;dead.enemyHp=1;swipe(dead,'left',()=>.9);assert.equal(dead.status,'won');assert.equal(dead.charge,5);assert.equal(dead.auto.serial,0,'do not cast at dead target');
const child=setup();child.cfg.autoSkill=null;child.charge=5;swipe(child,'left',()=>.9);assert.equal(child.auto.serial,0);assert.equal(skill(child),false);
const garden=setup('egg3',3);garden.board=Array(16).fill(null);garden.board[0]={v:32,t:'d',f:0};garden.board[1]={v:32,t:'a',f:0};garden.board[4]={v:8,t:'a',f:0};garden.board[5]={v:8,t:'a',f:0};garden.auto={buffs:{},mark:{cell:0,kind:'garden'},serial:0};swipe(garden,'left',()=>.9);assert.equal(garden.board[0].t,'x');assert.equal(garden.board[0].awake,true);assert.equal(garden.board[4].v,32);assert.equal(100000-garden.enemyHp,2*Math.floor(autoPower(garden,64).a*1.15)+Math.floor(autoPower(garden,16).a*1.15),'adjacent pair emits before doubling');
const number=setup('egg3',1);number.auto={buffs:{},mark:{cell:0,kind:'number'},serial:0};swipe(number,'left',()=>.9);assert.equal(number.board[0].v,32);
const bless=setup('egg3',5);bless.board=Array(16).fill(null);bless.board[0]={v:8,t:'d',f:0};bless.board[1]={v:8,t:'a',f:0};bless.auto={buffs:{},mark:{cell:0,kind:'blessing'},serial:0};swipe(bless,'left',()=>.9);assert.equal(100000-bless.enemyHp,3*Math.floor(p.a),'exactly 3, not 6 rounds');assert.equal(bless.board[0].awake,true);
const root=setup('egg3',4);root.board[0].f=2;root.charge=5;autoCast(root);assert.equal(root.board[0].f,2,'raise never clears roots');
const missing=setup('egg6',5);missing.board=Array(16).fill(null);missing.charge=5;autoCast(missing);assert.equal(missing.charge,0);assert.equal(missing.armor,Math.floor(p.d));
const low=setup('egg2',5);low.charge=4;low.countdown=1;swipe(low,'left',()=>.9);assert.equal(low.armor,Math.floor(p.d*.3),'new armor after reset');
const lethal=setup('egg1',5);lethal.hp=1;lethal.cfg.damage=1000;lethal.charge=4;lethal.countdown=1;swipe(lethal,'left',()=>.9);assert.equal(lethal.status,'lost');assert.equal(lethal.auto.buffs.counter,undefined);
const quake=setup('egg6',3);quake.charge=5;autoCast(quake);quake.board[0].t='x';quake.board[1].t='a';const out=runeMerge(quake,{v:16,t:'x'},1,1);assert.equal(out.d,Math.floor(p.d*1.1*1.5));assert.equal(runeState(quake).quake[0].power,out.d*.4,'no doubled armor bonus in counter');
run={skillVersion:1,room:2,companion:{stage:4,lane:'math',personality:'A',eggPrefix:'egg1',config:BASE},hero:'math',seed:1,relics:[],echo:false};state=setup();state.charge=5;const saved=state;hidePanel=()=>{};updateImages=()=>{};render=()=>{};enterBattle('mushroom');assert.equal(state.charge,5);assert.equal(state.auto,undefined);quiet(state);swipe(state,'right',()=>.9);assert.equal(state.auto.serial,1,'carry full charge casts after first valid swipe');
run={skillVersion:1,seed:1,relics:['echo','shadow','spark'],echo:true};state=setup('egg1',3);state.charge=3;runSwipe('left');assert.equal(state.auto.serial,1,'spark charges before Auto');assert.equal(state.cfg.attack,BASE.attack);assert.ok(state.board.some(t=>t?.v===16),'mirror once after Auto');
`,c);
console.log('PASS: all 36 casts, save/reload, random marks, no-op/expiry, Auto/attack ordering, death/Stage fallback, garden simultaneous merges, awakening/3 rounds, roots/missing targets, counter/rebuild, carry and relic synergy');
