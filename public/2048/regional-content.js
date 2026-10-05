'use strict';
const REGIONAL_RELICS=[
 {
  "id": "caveHammer",
  "name": "ค้อนผลึก",
  "grade": "Common",
  "icon": "⛏",
  "desc": "ผลึกใหม่มี 1 ชั้นแทน 2",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveLens",
  "name": "แว่นส่องผลึก",
  "grade": "Common",
  "icon": "🔍",
  "desc": "เตือนช่องผลึกล่วงหน้า 2 ปัด",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveCharge",
  "name": "เศษผลึกชาร์จ",
  "grade": "Common",
  "icon": "ϟ",
  "desc": "ทุบผลึกแตก ชาร์จ Auto +1 ต่อก้อน",
  "s4": true,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveNet",
  "name": "ตาข่ายกรองผลึก",
  "grade": "Rare",
  "icon": "🕸",
  "desc": "ผลเกราะ พลัง และฮีลของผลึกต่อศัตรูลดครึ่งหนึ่ง",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveArmor",
  "name": "เกราะเศษผลึก",
  "grade": "Rare",
  "icon": "◈",
  "desc": "ทุบผลึกแตก รับเกราะ 8% maxHP ต่อก้อน",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveShake",
  "name": "ค้อนสั่นสะเทือน",
  "grade": "Rare",
  "icon": "🔨",
  "desc": "ชุดรวมที่อยู่ติดผลึกออกผล ×1.3",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveHeart",
  "name": "หัวใจผลึก",
  "grade": "Rare",
  "icon": "🔥",
  "desc": "ทุบผลึกแตกยิงพลังดาบเลข 16 ต่อก้อน · ผลึกเกิดเร็วขึ้น 1 ปัด",
  "s4": false,
  "cursed": true,
  "region": "cave"
 },
 {
  "id": "caveMine",
  "name": "เหมืองผลึก",
  "grade": "Epic",
  "icon": "💎",
  "desc": "ทุบผลึกแตกเกิดรูนเลข 8 ชนิดสุ่มในช่องเดิม ไม่ออกผลทันที",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveChain",
  "name": "ระเบิดลูกโซ่ถ้ำ",
  "grade": "Epic",
  "icon": "🔗",
  "desc": "ชุดรวมมือที่ทุบแตกอย่างน้อย 2 ก้อน ออกผล ×2 ไม่เพิ่มคอมโบ",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "caveFriend",
  "name": "ผลึกเป็นมิตร",
  "grade": "Epic",
  "icon": "🤝",
  "desc": "ผลึกไม่ช่วยศัตรู · โบนัสรวม +6 จุดต่อก้อน cap18",
  "s4": false,
  "cursed": false,
  "region": "cave"
 },
 {
  "id": "skyGlue",
  "name": "กาวผลึกฟ้า",
  "grade": "Common",
  "icon": "🪶",
  "desc": "รูนร้าวมีเวลา 4 ปัด",
  "s4": false,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "skyBandage",
  "name": "ผ้าพันรอยร้าว",
  "grade": "Common",
  "icon": "✦",
  "desc": "รวมช่วยรูนร้าว ชาร์จ Auto +1 ต่อ merge",
  "s4": true,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "skyDew",
  "name": "น้ำค้างชำระ",
  "grade": "Common",
  "icon": "💧",
  "desc": "ชุดรวมรูนฮีลล้างพิษ 2 ชั้นต่อ merge",
  "s4": false,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "skyImmunity",
  "name": "ภูมิคุ้มกันเมฆ",
  "grade": "Rare",
  "icon": "☁",
  "desc": "พิษซ้อนได้สูงสุด 2 ชั้น",
  "s4": false,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "skyArmor",
  "name": "เกราะรอยร้าว",
  "grade": "Rare",
  "icon": "▣",
  "desc": "รูนร้าวแตก รับเกราะ 6% maxHP ต่อก้อน หลังโทษล้างเกราะ",
  "s4": false,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "skyBreath",
  "name": "รักษาลมหายใจ",
  "grade": "Rare",
  "icon": "🌬",
  "desc": "ช่วยร้าวสำเร็จ ยืดรูนร้าวที่เหลือ +1 ต่อปัด ไม่เกินอายุสูงสุดของห้อง",
  "s4": false,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "skyBrave",
  "name": "ใจกล้ากลางลม",
  "grade": "Rare",
  "icon": "⚡",
  "desc": "ชุดรวมช่วยร้าว ×2.5 · รอยร้าวเกิดเร็วขึ้น 1 ปัด และมีเวลา 2 ปัด",
  "s4": false,
  "cursed": true,
  "region": "sky"
 },
 {
  "id": "skyHeal",
  "name": "ฟื้นจากเศษ",
  "grade": "Epic",
  "icon": "✚",
  "desc": "รูนร้าวแตก ฮีล 4% maxHP และล้างพิษ 1 ชั้นต่อก้อน",
  "s4": false,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "skyGlow",
  "name": "ผลึกฟ้าเรืองรอง",
  "grade": "Epic",
  "icon": "🌟",
  "desc": "merge ที่ช่วยร้าวเพิ่มเลขผลลัพธ์อีกหนึ่งขั้นก่อนออกผล",
  "s4": false,
  "cursed": false,
  "region": "sky"
 },
 {
  "id": "poisonAwaken",
  "name": "พิษปลุกพลัง",
  "grade": "Epic",
  "icon": "☠",
  "desc": "พิษไม่ลดโจมตี · โบนัสรวม +10 จุดต่อชั้น Auto ไม่รับโบนัส เกราะยังลดตามเดิม",
  "s4": false,
  "cursed": false,
  "region": "sky"
 }
];
RELIC_V1.push(...REGIONAL_RELICS);
ACT_RELIC_POOLS.cave=REGIONAL_RELICS.filter(r=>r.region==='cave').map(r=>r.id);
ACT_RELIC_POOLS.sky=REGIONAL_RELICS.filter(r=>r.region==='sky').map(r=>r.id);
const contentActive=s=>regionalActive(s)&&s.cfg.contentVersion===1;
const contentHas=(s,id)=>contentActive(s)&&relicOwned(s,id);
const contentCurrentAct=journey=>journey.rewardNextAct||actNumber(Math.max(1,journey.room));
const beforeContentEligible=relicEligible;
relicEligible=function(r,journey=run){if(r.region&&(journey.contentVersion!==1||contentCurrentAct(journey)!==({cave:2,sky:3}[r.region])))return false;return beforeContentEligible(r,journey);};
const CONTENT_ENEMIES={
 cave_light:{hp:90,damage:14,interval:2,name:'ลูกผลึกถ้ำ',mechanic:'ตัวเบา · ไม่มีผลึก'},
 cave_guard:{hp:130,damage:16,interval:3,name:'เกราะผลึกถ้ำ',mechanic:'ผลึกช่วยลดดาเมจที่รับ'},
 cave_heavy:{hp:210,damage:25,interval:4,name:'ยักษ์ผลึกถ้ำ',mechanic:'ผลึกเพิ่มพลังหมัด'},
 cave_healer:{hp:70,damage:12,interval:3,name:'ผลึกถ้ำฟื้นตัว',mechanic:'ผลึกฟื้น HP หลังลงมือ'},
 cave_guardian:{hp:1100,damage:28,interval:3,name:'หมีผู้พิทักษ์ผลึก',mechanic:'ผลึกให้เกราะและพลัง · บอสสองเฟส'},
 sky_light:{hp:90,damage:14,interval:2,name:'ปีกผลึกอ่อน',mechanic:'ตัวเบา · ไม่มีรูนร้าว'},
 sky_haste:{hp:130,damage:18,interval:3,name:'ปีกเร่งลม',mechanic:'ร้าวแตก เร่งหมัดถัดไป'},
 sky_heavy:{hp:210,damage:28,interval:4,name:'ปีกผลึกหนัก',mechanic:'ร้าวแตก ล้างเกราะผู้เล่น'},
 sky_poison:{hp:70,damage:12,interval:3,name:'ปีกหมอกพิษ',mechanic:'ร้าวแตก เพิ่มพิษ'},
 sky_guardian:{hp:1100,damage:30,interval:3,name:'อินทรีผู้พิทักษ์ฟ้า',mechanic:'ร้าวแตก ล้างเกราะ เร่งหมัด และพิษ'}
};
const contentName=id=>CONTENT_ENEMIES[id]?.name||ENEMY[id]?.name;
const beforeContentStats=actStats;
actStats=function(enemy,room){const old=beforeContentStats(enemy,room),base=CONTENT_ENEMIES[enemy];if(run.contentVersion!==1||!base)return old;const growth=actDefinition(room).growth;return{hp:Math.round(base.hp*growth),damage:Math.round(base.damage*growth),interval:base.interval};};
const beforeContentIntro=regionalIntro;
regionalIntro=s=>beforeContentIntro(s)||contentActive(s)&&['cave_light','sky_light'].includes(s.enemy);
function contentCrystalRate(s){return contentHas(s,'caveFriend')?0:contentHas(s,'caveNet')?5:10;}
function contentPeriod(s,base){return contentActive(s)&&!regionalIntro(s)&&((regionalAct(s)===2&&contentHas(s,'caveHeart'))||(regionalAct(s)===3&&contentHas(s,'skyBrave')))?Math.max(2,base-1):base;}
function contentLifetime(s){return contentHas(s,'skyBrave')?2:contentHas(s,'skyGlue')?4:3;}
function contentCrystalTurn(s,random,period,cap){
 const h=regionalState(s),lead=contentHas(s,'caveLens')?2:1;
 if(h.crystalPeriod!==period){h.crystalPeriod=period;h.nextCrystalClock=h.clock+Math.max(lead,period-1);h.warning=null;}
 if(h.clock>=h.nextCrystalClock){const cell=h.warning?.cell;h.warning=null;h.nextCrystalClock=h.clock+period;
  if(cell!==undefined&&cell!==null&&!s.board[cell]&&!regionalCell(s,cell)&&h.crystals.length<cap&&regionalNeighbours(cell).some(i=>s.board[i])&&regionalCanMove({...s,hazards:{...h,crystals:[...h.crystals,{cell,layers:2}]}})){h.crystals.push({cell,layers:contentHas(s,'caveHammer')?1:2});h.stats.crystalsPlaced++;log(s,'ผลึกเกิด');}
 }
 if(!h.warning&&h.crystals.length<cap&&h.nextCrystalClock-h.clock<=lead){const cell=regionalCrystalTarget(s,random);if(cell!==null){h.nextCrystalClock=Math.max(h.nextCrystalClock,h.clock+lead);h.warning={cell,dueMove:s.moves+h.nextCrystalClock-h.clock};}}
}
const beforeContentFactor=relicFactor;
relicFactor=function(s,t,dir,source,combo){const base=beforeContentFactor(s,t,dir,source,combo);if(!contentActive(s)||!['swipe','gravity'].includes(source))return base;const count=s.contentMerge?.crystalCount??regionalState(s).crystals.length;let add=(contentHas(s,'caveFriend')?.06*Math.min(3,count):0)+(contentHas(s,'poisonAwaken')?.1*(s.poison?.stacks||0):0),factor=base+add*combo;
 if(contentHas(s,'caveShake')&&t.contentAdjacent)factor*=1.3;
 if(contentHas(s,'skyBrave')&&t.rescued?.length)factor*=2.5;
 if(source==='swipe'&&s.contentMerge?.chain)factor*=2;return relicSafe(factor);
};
const beforeContentSlide=regionalSlide;
regionalSlide=function(board,dir,rune,chain=false,roots=true,context=null,owner=context){
 const r=beforeContentSlide(board,dir,rune,chain,roots,context,owner);if(!contentActive(owner))return r;
 for(const t of r.merges)t.contentAdjacent=regionalState(owner).crystals.some(c=>regionalNeighbours(c.cell).includes(t.cell));
 if(!contentHas(owner,'skyGlow'))return r;
 const upgrades=[];
 for(const t of r.merges){const inherited=upgrades.filter(u=>u.sourceIds.every(id=>t.sourceIds.includes(id))).length;if(t.rescued?.length)upgrades.push({sourceIds:t.sourceIds});const steps=inherited+(t.rescued?.length?1:0);if(steps){t.v=Math.min(2**30,t.v*2**steps);if(t.t==='x'&&rune==='egg3'&&t.v>=64)t.awake=true;}}
 const counts=new Map();for(const u of upgrades){const from=board.findIndex(t=>t?.uid===u.sourceIds[0]),to=r.moves.find(m=>m.from===from)?.to;if(to!==undefined)counts.set(to,(counts.get(to)||0)+1);}
 for(const [cell,steps]of counts){const t=r.board[cell];if(t){t.v=Math.min(2**30,t.v*2**steps);if(t.t==='x'&&rune==='egg3'&&t.v>=64)t.awake=true;}}
 return r;
};
const beforeContentMerges=relicMerges;
relicMerges=function(s,r,dir,source,random,periodic){if(!contentActive(s))return beforeContentMerges(s,r,dir,source,random,periodic);const h=regionalState(s),broken=h.crystals.filter(c=>c.layers===1&&c.hitMove!==s.moves&&r.merges.some(t=>regionalNeighbours(c.cell).includes(t.cell)));s.contentMerge={crystalCount:h.crystals.length,chain:source==='swipe'&&contentHas(s,'caveChain')&&broken.length>=2};try{return beforeContentMerges(s,r,dir,source,random,periodic);}finally{delete s.contentMerge;}};
function contentAfterMerges(s,r,source,random,saved,broken){
 if(!contentActive(s))return;
 if(broken.length&&contentHas(s,'caveCharge'))s.charge=Math.min(s.cfg.cooldown,s.charge+broken.length);
 if(broken.length&&contentHas(s,'caveArmor'))regionalArmorScope(s,()=>{s.armor+=Math.ceil(s.cfg.hp*.08)*broken.length;});
 if(broken.length&&contentHas(s,'caveHeart'))for(const c of broken)relicHit(s,runePower(s,16).a);
 if(broken.length&&contentHas(s,'caveMine'))for(const c of broken){s.board[c.cell]={v:8,t:['a','d','h','x'][Math.floor(random()*4)],f:0};regionalStamp(s);}
 const merges=r.merges.filter(t=>t.rescued?.length).length;
 if(merges&&contentHas(s,'skyBandage'))s.charge=Math.min(s.cfg.cooldown,s.charge+merges);
 const h=regionalState(s);if(saved.size&&contentHas(s,'skyBreath')&&h.breathMove!==s.moves){h.breathMove=s.moves;for(const t of s.board)if(t?.crack)t.crack.remaining=Math.min(contentLifetime(s),t.crack.remaining+1);}
}
function contentAfterExpired(s,count){
 if(!contentActive(s))return;
 if(contentHas(s,'skyArmor'))regionalArmorScope(s,()=>{s.armor+=Math.ceil(s.cfg.hp*.06)*count;});
 if(contentHas(s,'skyHeal')){relicHeal(s,Math.ceil(s.cfg.hp*.04)*count);if(s.poison){s.poison.stacks=Math.max(0,s.poison.stacks-count);if(!s.poison.stacks)delete s.poison;}}
}
