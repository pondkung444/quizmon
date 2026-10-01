'use strict';
// Skill effects use unmodified power; only ordinary rune output inherits combo/relics.
const AUTO_SKILLS={
 egg1:[['คมเพลิงต่อเนื่อง','ตี 40% · รวมรูนฟันเพิ่ม 20% สูงสุด 3 ครั้งใน 3 ปัด'],['ปราการแก้วอัคคี','เกราะ 60% · เผา 20% อีก 2 ปัด'],['ลาวาปะทุ','เผา 25% อีก 3 ปัด'],['อัสนีอัคคี','โจมตีทันที 90%'],['คำรามราชัน','ตี 30% · รูนเพลิงแรงขึ้น 25% อีก 3 ปัด'],['เกราะสุริยัน','เกราะ 80% · สวน 40% หลังรับหมัดและรอด']],
 egg2:[['งาหนามทะลวง','ตี 60% · รวมโล่/พฤกษ์ฟันเพิ่ม 20% สูงสุด 3 ครั้งใน 3 ปัด'],['เปลือกไม้ซ้อนชั้น','เกราะ 70% · ลดหมัดถัดไป 15%'],['บุปผาระเบิด','ฮีล 80% · ส่วนเกินเป็นเกราะ'],['รากหล่อเลี้ยง','ฟื้น 25% อีก 3 ปัด · ส่วนเกินเป็นเกราะ'],['พรแห่งพงไพร','รูนพฤกษ์แรงขึ้น 25% อีก 3 ปัด'],['พฤกษ์ค้ำจุน','เกราะ 60% · หลังรับหมัดและรอดได้เกราะใหม่ 30%']],
 egg4:[['คมผลึกเยือกแข็ง','ตี 80% + 20% ต่อความเย็น สูงสุด 140%'],['ปราการน้ำแข็ง','เกราะ 80% + 20% ต่อความเย็น สูงสุด 140%'],['คำรามเยือกสะท้าน','รวมธารตีเพิ่ม 40% ของดาบเลขหลังรวม อีก 3 ปัด'],['ธารเย็นหล่อเลี้ยง','รวมธารฮีล 40% ของฮีลเลขหลังรวม อีก 3 ปัด · ส่วนเกินเป็นเกราะ'],['พายุหิมะ','เติมความเย็น 2 · รวมธารเพื่อใช้ชะลอ'],['ผลึกเหมันต์พิทักษ์','ลดหมัดถัดไป 15% + 5% ต่อความเย็น สูงสุด 30%']],
 egg5:[['อัสนีทวีคม','ตี 100% · รูนนภาตีแรงขึ้น 75% อีก 3 ปัด'],['ประจุพิทักษ์','เกราะ 100% · นภาเร่งชาร์จได้เกราะ 60% สูงสุด 2 ครั้งใน 3 ปัด'],['เมฆาคำราม','พายุตี 70% อีก 3 ปัด'],['ม่านเมฆอัมพาต','ตี 100% · ลดหมัดถัดไป 40%'],['อัสนีแปรรูน','ตี 80% · แปรรูนพื้นฐานเลขต่ำสุด 2 ช่องเป็นนภา'],['อัสนีประสานฟ้า','ตี 80% + 60% ต่อรูนนภา สูงสุด 320%']],
 egg6:[['ศรแกนศิลา','ตี 100% · รวมลงมาร์คยิง 150% ของดาบเลขหลังรวม'],['ตราปราการ','เกราะ 80% · รวมลงมาร์คได้เกราะ 150% ของโล่เลขหลังรวม'],['แผ่นดินคำราม','ตี 80% · ธราสร้างแรงสวนเพิ่ม 100% อีก 3 ปัด'],['มหาปราการ','เกราะ 120% · ธราสร้างเกราะเพิ่ม 50% อีก 3 ปัด'],['พรแห่งผืนดิน','ฮีล 60% ส่วนเกินเป็นเกราะ · รวมลงมาร์คได้ผลรูน 2 รอบ'],['ฌานยกระดับศิลา','เกราะ 100% · ธราเลขต่ำสุด 2 ช่องเพิ่มเลข ×2']],
 egg3:[['รังสีพิพากษา','ตี 200% · รูนเทพตีแรงขึ้น 100% อีก 3 ปัด'],['ตราอนันต์','เกราะ 120% · รวมลงมาร์คเพิ่มเลขผลลัพธ์ ×2 แล้วออกพลัง'],['พฤกษ์แปรทิพย์','ตี 100% · แปรรูนพื้นฐานเลขต่ำสุด 3 ช่องเป็นเทพตื่นพลัง'],['สวนทิพย์ผลิบาน','รวมลงมาร์คเป็นเทพ · รูนข้างเคียงเพิ่มเลข ×2'],['เพลิงยกระดับ','ตี 160% · รูนเลขต่ำสุด 3 ช่องเพิ่มเลข ×2'],['ตรามหาพร','เกราะ 120% · รวมลงมาร์คเป็นเทพตื่นพลังให้พร 3 รอบ']]
};
const MARK_ICONS={arrow:'➶',guard:'⬡',double:'Ⅱ',number:'×2',garden:'❀',blessing:'Ⅲ'};
function skillIdentity(p){if(!p||p.stage!==4||!AUTO_SKILLS[p.eggPrefix]||!['A','B'].includes(p.personality))return null;const lane=['math','science','balanced'].indexOf(p.lane);return lane<0?null:{egg:p.eggPrefix,index:lane*2+(p.personality==='B'?1:0)};}
function skillInfo(s){const id=s.cfg.autoSkill;return id?AUTO_SKILLS[id.egg]?.[id.index]:null;}
function autoState(s){return s.auto??={buffs:{},mark:null,serial:0,event:null};}
function autoPower(s,value=16){const c=s.cfg.skillBase||s.cfg;const k=(value/4)**.8;return{a:k*c.attack,d:k*c.armor,h:k*c.hp*c.heal/100};}
function autoHit(s,power){const n=Math.floor(power);s.enemyHp=Math.max(0,s.enemyHp-(s.enemy==='beetle'&&!s.heavy?Math.ceil(n/2):n));}
function autoHeal(s,power,overflow=false){const n=Math.floor(power),heal=Math.min(s.cfg.hp-s.hp,n);s.hp+=heal;if(overflow)s.armor+=n-heal;}
function autoBuff(s,key,extra={}){autoState(s).buffs[key]={remaining:3,...extra};}
function autoMark(s,kind,rng){const a=autoState(s);if(!a.mark)a.mark={cell:Math.min(15,Math.floor(rng()*16)),kind};}
function autoTargets(s,predicate,n){return s.board.map((t,i)=>t&&predicate(t)?i:null).filter(i=>i!==null).sort((a,b)=>s.board[a].v-s.board[b].v||a-b).slice(0,n);}
function autoRaise(t){if(t)t.v=Math.min(2**30,t.v*2);}
function autoTick(s){const a=autoState(s);a.event=null;for(const key of ['burn','storm','regen']){const b=a.buffs[key];if(!b)continue;if(key==='regen')autoHeal(s,b.power,true);else autoHit(s,b.power);}}
function autoAge(s){const bs=autoState(s).buffs;for(const [k,b]of Object.entries(bs))if(Number.isFinite(b.remaining)&&--b.remaining<=0)delete bs[k];}
function autoRuneBuff(s){return autoState(s).buffs.rune;}
function autoRuneMerge(s,t,factor,critical,baseMerge){const b=autoState(s).buffs.rune,r=runeState(s),n=r.quake.length;if(!b)return baseMerge(s,t,factor,critical);const view={...s,cfg:{...s.cfg,attack:s.cfg.attack*(1+(b.attack||0)),armor:s.cfg.armor*(1+(b.armor||0)),heal:s.cfg.heal*(1+(b.heal||0))}};const out=baseMerge(view,t,factor,critical);for(const g of r.quake.slice(n))g.power*=1+(b.counter||0);return out;}
function autoPrepareMerges(s,r){const mark=autoState(s).mark;if(!mark)return null;const j=r.merged.indexOf(mark.cell);if(j<0)return null;const t=r.merges[j];if(mark.kind==='number'){autoRaise(t);if(t.t==='x'&&s.cfg.rune==='egg3'&&t.v>=64)t.awake=true;}if(['garden','blessing'].includes(mark.kind)){t.t='x';t.awake=mark.kind==='blessing'||!!s.board[mark.cell]?.awake||t.v>=64;}Object.assign(s.board[mark.cell],t);autoState(s).mark=null;return{...mark,merge:j};}
function autoMergeEffects(s,t,index,mark){const a=autoState(s),b=a.buffs,p=autoPower(s,t.v);if(b.follow&&b.follow.quota>0&&(!b.follow.defensive||t.t==='d'||t.t==='x')){autoHit(s,b.follow.power);b.follow.quota--;}
 if(t.t==='x'&&b.water){if(b.water.heal)autoHeal(s,p.h*.4,true);else autoHit(s,p.a*.4);}
 if(mark&&mark.merge===index){if(mark.kind==='arrow')autoHit(s,p.a*1.5);if(mark.kind==='guard')s.armor+=Math.floor(p.d*1.5);
 if(mark.kind==='double'){runeState(s);const view={...s,cfg:{...s.cfg,...s.cfg.skillBase}};const e=t.t==='x'?runeMerge(view,t,1,1):{a:t.t==='a'?p.a:0,d:t.t==='d'?p.d:0,h:t.t==='h'?p.h:0};autoHit(s,e.a);s.armor+=Math.floor(e.d);autoHeal(s,e.h);}
 // The ordinary merge emits the first 2 awake rounds; add one unboosted round to total 3.
 if(mark.kind==='blessing'){autoHit(s,p.a);s.armor+=Math.floor(p.d*.7);autoHeal(s,p.h*.4);}
 }}
function autoPostMerges(s,mark){if(mark?.kind==='garden'){const row=Math.floor(mark.cell/4),col=mark.cell%4;for(const i of [row>0?mark.cell-4:null,row<3?mark.cell+4:null,col>0?mark.cell-1:null,col<3?mark.cell+1:null])if(i!==null)autoRaise(s.board[i]);}if(mark){const a=autoState(s);a.markEvent={...mark,move:s.moves};}}
function autoSpark(s){const b=autoState(s).buffs.spark;if(b&&b.quota>0){s.armor+=Math.floor(autoPower(s).d*.6);b.quota--;}}
function autoReduction(s,power){const b=autoState(s).buffs.reduce;if(!b)return power;delete autoState(s).buffs.reduce;return Math.floor(power*(1-b.amount));}
function autoAfterAttack(s){const b=autoState(s).buffs,p=autoPower(s);if(b.counter){autoHit(s,b.counter.power);delete b.counter;}if(b.rebuild){s.armor+=Math.floor(p.d*.3);delete b.rebuild;}}
function autoCast(s,rng=Math.random){if(!skillInfo(s)||s.status!=='playing'||s.charge<s.cfg.cooldown||s.enemyHp<=0)return false;const a=autoState(s),p=autoPower(s),{egg,index:i}=s.cfg.autoSkill,bs=a.buffs,cold=Math.min(3,runeState(s).cold);s.charge=0;
 switch(egg){
 case'egg1':switch(i){case 0:autoHit(s,p.a*.4);autoBuff(s,'follow',{power:p.a*.2,quota:3});break;case 1:s.armor+=Math.floor(p.d*.6);autoBuff(s,'burn',{power:p.a*.2,remaining:2});break;case 2:autoBuff(s,'burn',{power:p.a*.25});break;case 3:autoHit(s,p.a*.9);break;case 4:autoHit(s,p.a*.3);autoBuff(s,'rune',{attack:.25});break;case 5:s.armor+=Math.floor(p.d*.8);bs.counter={power:p.a*.4};break;}break;
 case'egg2':switch(i){case 0:autoHit(s,p.a*.6);autoBuff(s,'follow',{power:p.a*.2,quota:3,defensive:true});break;case 1:s.armor+=Math.floor(p.d*.7);bs.reduce={amount:.15};break;case 2:autoHeal(s,p.h*.8,true);break;case 3:autoBuff(s,'regen',{power:p.h*.25});break;case 4:autoBuff(s,'rune',{armor:.25,heal:.25});break;case 5:s.armor+=Math.floor(p.d*.6);bs.rebuild={};break;}break;
 case'egg4':switch(i){case 0:autoHit(s,p.a*(.8+.2*cold));break;case 1:s.armor+=Math.floor(p.d*(.8+.2*cold));break;case 2:autoBuff(s,'water',{heal:false});break;case 3:autoBuff(s,'water',{heal:true});break;case 4:runeState(s).cold+=2;break;case 5:bs.reduce={amount:.15+.05*cold};break;}break;
 case'egg5':switch(i){case 0:autoHit(s,p.a);autoBuff(s,'rune',{attack:.75});break;case 1:s.armor+=Math.floor(p.d);autoBuff(s,'spark',{quota:2});break;case 2:autoBuff(s,'storm',{power:p.a*.7});break;case 3:autoHit(s,p.a);bs.reduce={amount:.4};break;case 4:autoHit(s,p.a*.8);for(const j of autoTargets(s,t=>t.t!=='x',2))convertRune(s,j);break;case 5:autoHit(s,p.a*(.8+.6*Math.min(4,s.board.filter(t=>t?.t==='x').length)));break;}break;
 case'egg6':switch(i){case 0:autoHit(s,p.a);autoMark(s,'arrow',rng);break;case 1:s.armor+=Math.floor(p.d*.8);autoMark(s,'guard',rng);break;case 2:autoHit(s,p.a*.8);autoBuff(s,'rune',{counter:1});break;case 3:s.armor+=Math.floor(p.d*1.2);autoBuff(s,'rune',{armor:.5});break;case 4:autoHeal(s,p.h*.6,true);autoMark(s,'double',rng);break;case 5:s.armor+=Math.floor(p.d);for(const j of autoTargets(s,t=>t.t==='x',2))autoRaise(s.board[j]);break;}break;
 case'egg3':switch(i){case 0:autoHit(s,p.a*2);autoBuff(s,'rune',{attack:1});break;case 1:s.armor+=Math.floor(p.d*1.2);autoMark(s,'number',rng);break;case 2:autoHit(s,p.a);for(const j of autoTargets(s,t=>t.t!=='x',3)){convertRune(s,j);awakenRune(s,j);}break;case 3:autoMark(s,'garden',rng);break;case 4:autoHit(s,p.a*1.6);for(const j of autoTargets(s,()=>true,3))autoRaise(s.board[j]);break;case 5:s.armor+=Math.floor(p.d*1.2);autoMark(s,'blessing',rng);break;}break;
 }
 a.serial++;a.event={serial:a.serial,name:skillInfo(s)[0],egg,index:i,move:s.moves};log(s,'✦ Auto: '+a.event.name);
 if(s.cfg.relicShadow){const ids=autoTargets(s,()=>true,16),empty=s.board.map((t,i)=>t?null:i).filter(i=>i!==null);if(ids.length&&empty.length){const t=s.board[ids[ids.length-1]];s.board[empty[Math.floor(rng()*empty.length)]]={t:t.t,v:Math.min(16,t.v),f:0};}}
 finish(s);return true;
}
