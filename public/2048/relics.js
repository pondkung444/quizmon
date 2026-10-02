'use strict';
// Version 1 applies only to newly started journeys. IDs remain stable in saves.
const RELIC_V1=[
  {
    "id": "shadow",
    "name": "กระจกคู่หู",
    "desc": "หลังใช้สกิล สร้างรูนชนิดเดียวกับรูนใหญ่สุดในช่องว่าง 1 ช่อง เลขไม่เกิน 16 ไม่ออกผลทันที",
    "grade": "Common",
    "s4": true,
    "cursed": false,
    "icon": "◈"
  },
  {
    "id": "spark",
    "name": "สายฟ้าคู่หู",
    "desc": "รวมอย่างน้อย 2 คู่ในปัดเดียว ได้ชาร์จสกิลเพิ่ม 1",
    "grade": "Common",
    "s4": true,
    "cursed": false,
    "icon": "ϟ"
  },
  {
    "id": "seed",
    "name": "เมล็ดคู่แฝด",
    "desc": "รูนเกิดใหม่มีโอกาสเป็นเลข 4 เพิ่มเป็น 35%",
    "grade": "Common",
    "s4": false,
    "cursed": false,
    "icon": "🌱"
  },
  {
    "id": "root",
    "name": "แหวนคลายราก",
    "desc": "รากใหม่เหลือชั้นเดียว ชนครั้งเดียวคลาย · มีผลเฉพาะกับบอสพันราก",
    "grade": "Common",
    "s4": false,
    "cursed": false,
    "icon": "🌿"
  },
  {
    "id": "oracle",
    "name": "ดวงตาพยากรณ์",
    "desc": "แสดงชนิดและเลขของรูนที่จะเกิดถัดไปที่ขอบกระดาน · เปลี่ยนจากปัดตามดวงเป็นวางแผน 1 ก้าว ช่วยมือใหม่",
    "grade": "Common",
    "s4": false,
    "cursed": false,
    "icon": "👁"
  },
  {
    "id": "weakness",
    "name": "จุดอ่อนจอมพลัง",
    "desc": "ตั้งแต่ศัตรูประกาศท่าหนักจนลงมือ ศัตรูรับดาเมจเพิ่ม 50% · ทุกท่าหนักเป็นการตัดสินใจรับหรือบุก",
    "grade": "Common",
    "s4": false,
    "cursed": false,
    "icon": "🎯"
  },
  {
    "id": "crisis",
    "name": "ใจสู้ยามวิกฤต",
    "desc": "HP ต่ำกว่า 35% ทุกการรวมได้ผลโจมตีเพิ่ม 50% ของดาบเลขเดียวกัน · เลือดน้อยกลายเป็นช่วงพลัง",
    "grade": "Common",
    "s4": false,
    "cursed": false,
    "icon": "♥"
  },
  {
    "id": "overflow",
    "name": "ล้นพร",
    "desc": "ฮีลส่วนที่เกิน HP สูงสุดกลายเป็นเกราะ ทุกแหล่งฮีล · ไม่ซ้อน 2 เท่ากับสกิลที่มีผลนี้อยู่แล้ว",
    "grade": "Common",
    "s4": false,
    "cursed": false,
    "icon": "✚"
  },
  {
    "id": "pierce",
    "name": "ดาบทะลุร่าง",
    "desc": "ดาเมจส่วนเกินที่ฆ่าศัตรู ยิงใส่ศัตรูตัวถัดไปตอนเริ่มห้อง สูงสุด 50% HP ตัวนั้น",
    "grade": "Common",
    "s4": false,
    "cursed": false,
    "icon": "⚔"
  },
  {
    "id": "wound",
    "name": "แผลปลุกพลัง",
    "desc": "โดนตีจน HP ลด ได้ชาร์จสกิลเพิ่ม 1",
    "grade": "Common",
    "s4": true,
    "cursed": false,
    "icon": "✦"
  },
  {
    "id": "markCompass",
    "name": "เข็มทิศมาร์ค",
    "desc": "มาร์คใหม่วางใต้รูนเลขสูงสุดที่ยังไม่มีมาร์ค แทนการสุ่ม · มีผลเมื่อมีแหล่งมาร์ค (สกิลมาร์คหรือตราประทับคู่หู)",
    "grade": "Common",
    "s4": true,
    "cursed": false,
    "icon": "🧭"
  },
  {
    "id": "growth",
    "name": "ผลึกเติบโต",
    "desc": "Auto ทุกครั้งเพิ่มเลขรูนเลขต่ำสุด 1 ช่องขึ้น 1 ขั้น ไม่ออกผลทันที",
    "grade": "Common",
    "s4": true,
    "cursed": false,
    "icon": "💎"
  },
  {
    "id": "instant",
    "name": "ฉับพลันแรกพบ",
    "desc": "เริ่มห้องต่อสู้ด้วยชาร์จเต็ม โดยไม่เก็บชาร์จเดิมข้ามห้อง",
    "grade": "Common",
    "s4": true,
    "cursed": false,
    "icon": "⚡"
  },
  {
    "id": "echo",
    "name": "เสียงสะท้อน",
    "desc": "ปัดที่ไม่รวมรูน เตรียมให้การรวมครั้งถัดไป ×1.5",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "〰"
  },
  {
    "id": "thorn",
    "name": "หนามสะท้อน",
    "desc": "เกราะรับหมัดได้ทั้งหมด สะท้อนพลังโจมตีนั้นกลับใส่ศัตรู ผ่านท่าตั้งรับด้วง",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "❋"
  },
  {
    "id": "corner",
    "name": "หินมุมศิลา",
    "desc": "การรวมที่ผลลัพธ์อยู่ช่องมุม ออกผล ×1.5 · ให้รางวัลกลยุทธ์ 2048 แท้",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "◩"
  },
  {
    "id": "wind",
    "name": "เข็มทิศลมป่า",
    "desc": "ทิศนำโชคหนึ่งทิศ ปัดทิศนั้นการรวม ×1.5 ทิศเปลี่ยนทุกครั้งที่ศัตรูลงมือ",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "➜"
  },
  {
    "id": "blood",
    "name": "สายเลือดเดียวกัน",
    "desc": "รวมชนิดเดียวกัน ×1.4 ข้ามชนิดปกติ · เกมกลายเป็นการจัดสี · ห้ามออกคู่กับตราสามัคคี",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "🩸"
  },
  {
    "id": "pulse",
    "name": "แกนพลังผลึก",
    "desc": "ทุกครั้งที่ศัตรูลงมือ รูนเลขสูงสุดเปล่งผลชนิดตัวเอง 30% โดยไม่ถูกใช้หมด · ให้เหตุผลปั้นก้อนใหญ่",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "✧"
  },
  {
    "id": "twins",
    "name": "ไข่ผลึกคู่แฝด",
    "desc": "ทุกปัดเกิดรูนใหม่ 2 ลูก · เสีย: ทั้งสองเป็นเลข 2 เสมอ กระดานตันง่ายขึ้น · ห้ามถือร่วมกับเมล็ดคู่แฝด",
    "grade": "Rare",
    "s4": false,
    "cursed": true,
    "icon": "🥚"
  },
  {
    "id": "timing",
    "name": "คมเฉือนเวลา",
    "desc": "การรวมในปัดสุดท้ายก่อนศัตรูลงมือ (ตัวนับเหลือ 1) ออกผล ×2",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "⌛"
  },
  {
    "id": "hourglass",
    "name": "นาฬิกาทรายผลึก",
    "desc": "ปัดที่รวม 3 คู่ขึ้นไป เลื่อนการลงมือศัตรู 1 ปัด สูงสุดครั้งเดียวต่อรอบนับถอยหลัง",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "⏳"
  },
  {
    "id": "shieldStrike",
    "name": "โล่กระแทก",
    "desc": "ขณะเกราะมากกว่าหมัดถัดไป การรวมโล่โจมตีเพิ่ม 50% ของโล่เลขนั้น · ให้สายรับมีทางฆ่าศัตรู",
    "grade": "Rare",
    "s4": false,
    "cursed": false,
    "icon": "🛡"
  },
  {
    "id": "jar",
    "name": "ไหผลึกบูชา",
    "desc": "เริ่มห้องต่อสู้ด้วยรูนเลข 16 จำนวน 3 ช่อง ชนิดสุ่ม · เสีย: HP 8% ของสูงสุดทุกห้อง",
    "grade": "Rare",
    "s4": false,
    "cursed": true,
    "icon": "🏺"
  },
  {
    "id": "drum",
    "name": "กลองเร่งศึก",
    "desc": "ทุกการรวม ×1.4 · เสีย: ศัตรูลงมือเร็วขึ้น 1 ปัด",
    "grade": "Rare",
    "s4": false,
    "cursed": true,
    "icon": "🥁"
  },
  {
    "id": "seal",
    "name": "ตราประทับคู่หู",
    "desc": "Auto ทุกครั้งวางมาร์คชาร์จ 1 จุด รวมลงได้ชาร์จเพิ่ม 2 · ให้ร่างไม่มีมาร์คได้เล่นมาร์ค ใช้เพดาน 16 ช่องร่วม",
    "grade": "Rare",
    "s4": true,
    "cursed": false,
    "icon": "⬡"
  },
  {
    "id": "pin",
    "name": "หมุดผลึกคงทน",
    "desc": "มาร์คทุกชนิดทำงานได้ 2 ครั้งก่อนหาย",
    "grade": "Rare",
    "s4": true,
    "cursed": false,
    "icon": "📍"
  },
  {
    "id": "interrupt",
    "name": "ผนึกขัดจังหวะ",
    "desc": "Auto ที่ทำงานขณะศัตรูประกาศท่าหนัก เปลี่ยนเป็นท่าปกติ · หลังยกเลิกสำเร็จ ท่าหนักถัดไปยกเลิกไม่ได้",
    "grade": "Rare",
    "s4": true,
    "cursed": false,
    "icon": "⊘"
  },
  {
    "id": "candle",
    "name": "เทียนผสานพลัง",
    "desc": "ผลสกิลรับโบนัสคอมโบของปัดที่ Auto ทำงาน (ยังไม่รับคริ/เสียงสะท้อน) · เปลี่ยนกฎสกิลเฉพาะเมื่อถือเรลิคนี้",
    "grade": "Rare",
    "s4": true,
    "cursed": false,
    "icon": "🕯"
  },
  {
    "id": "heavyCoin",
    "name": "เหรียญหนักใจ",
    "desc": "การรวมแรงขึ้น +1% ต่อเหรียญที่ถือ สูงสุด +50% · เสีย: ซื้อของในร้านไม่ได้อีก · ต้องนำเหรียญกลับมาแสดงบน HUD",
    "grade": "Rare",
    "s4": false,
    "cursed": true,
    "icon": "🪙"
  },
  {
    "id": "unity",
    "name": "ตราสามัคคี",
    "desc": "รวมต่างชนิด ทั้งสองชนิดออกผลคนละ 60% แทนฝั่งปลายทางชนะ · เปลี่ยนกฎกลาง ความเย็น/ประจุนับเต็ม 1 หน่วยต่อคู่ · ห้ามออกคู่กับสายเลือดเดียวกัน",
    "grade": "Epic",
    "s4": false,
    "cursed": false,
    "icon": "☯"
  },
  {
    "id": "chain",
    "name": "ลูกโซ่ผลึก",
    "desc": "รูนที่เพิ่งรวม ถ้าจบติดรูนเลขเท่ากันในแนวที่ปัด รวมต่ออีก 1 ครั้ง นับเป็นคู่เพิ่มในคอมโบ · ทำลายกฎรวมครั้งเดียวต่อปัด จำกัด 1 ทอดต่อรูนต่อปัด",
    "grade": "Epic",
    "s4": false,
    "cursed": false,
    "icon": "⛓"
  },
  {
    "id": "gravity",
    "name": "หินแรงโน้มถ่วง",
    "desc": "หลังศัตรูลงมือ กระดานไหลลงเอง 1 ครั้ง รวมได้ปกติ ไม่เกิดรูนใหม่ ไม่นับปัด · การรวมลงมาร์คจากการไหลทำงานด้วย",
    "grade": "Epic",
    "s4": false,
    "cursed": false,
    "icon": "⬇"
  },
  {
    "id": "explosion",
    "name": "ระเบิดผลึก",
    "desc": "กระดานตันไม่เสีย HP 25% แต่ระเบิดรูนทุกช่องออกผล 40% เหลือรูนใหญ่สุด 2 ช่อง ห้องละครั้ง · พลิกจุดอ่อนเป็นอาวุธ",
    "grade": "Epic",
    "s4": false,
    "cursed": false,
    "icon": "💥"
  },
  {
    "id": "retention",
    "name": "เกราะผลึกค้าง",
    "desc": "หลังศัตรูโจมตี เกราะเหลือคงไว้ครึ่งหนึ่งแทนรีเซ็ต 0 · เปลี่ยนกฎเกราะที่ล็อก ทำให้หนามสะท้อนทำงานง่ายขึ้นมาก",
    "grade": "Epic",
    "s4": false,
    "cursed": false,
    "icon": "▣"
  },
  {
    "id": "resonance",
    "name": "ก้องสะท้อนคู่หู",
    "desc": "Auto ครั้งที่ 3 ของทุกรอบทำงานซ้ำทันทีอีก 1 รอบ แสดงจุดนับ 3 ดวงใต้เกจ · รอบซ้ำวางมาร์คด้วย",
    "grade": "Epic",
    "s4": true,
    "cursed": false,
    "icon": "≋"
  },
  {
    "id": "battery",
    "name": "หัวใจกักพลัง",
    "desc": "ชาร์จเต็มแล้ว Auto รอทำงานปัดสุดท้ายก่อนศัตรูลงมือ ผลสกิล ×1.5 · เปลี่ยนจังหวะ Auto",
    "grade": "Epic",
    "s4": true,
    "cursed": false,
    "icon": "♥"
  },
  {
    "id": "tome",
    "name": "ตำราต้องสาป",
    "desc": "ตอบประตูควิซถูก เลือกรับรางวัล 2 ชิ้น · เสีย: ควิซช่วยชีวิตถูกปิดทั้งการเดินทาง · ไม่ลงโทษการตอบผิด",
    "grade": "Epic",
    "s4": false,
    "cursed": true,
    "icon": "📖"
  },
  {
    "id": "crown",
    "name": "มงกุฎผู้พิชิต",
    "desc": "หลังได้รับ ชนะกวางแต่ละครั้งเพิ่มโบนัสรวม +20 จุดเปอร์เซ็นต์; ดาเมจศัตรูโต ×1.16 ต่อเลเวลหลังได้รับแทน ×1.08",
    "grade": "Epic",
    "s4": false,
    "cursed": true,
    "icon": "♛"
  },
  {
    "id": "noRest",
    "name": "พันธะไร้พัก",
    "desc": "บ่อน้ำพักใจทุกบ่อเปลี่ยนเป็นห้องเลือกเรลิค · เสีย: ฟื้น HP จากบ่อน้ำไม่ได้อีก",
    "grade": "Epic",
    "s4": false,
    "cursed": true,
    "icon": "🔗"
  }
];
const relicActive=()=>run?.relicVersion===1;
const relicOwned=(s,id)=>s.cfg.relicVersion===1&&s.cfg.relics?.includes(id);
function relicState(s){return s.relic??={echo:false,direction:'down',autoCount:0,interruptLocked:false,hourglass:false,exploded:false,nextRune:null};}
function relicEligible(r,journey=run){const owned=journey.relics;if(owned.includes(r.id))return false;if(r.s4&&!skillIdentity(journey.companion))return false;
 const pairs={seed:'twins',twins:'seed',blood:'unity',unity:'blood'};if(owned.includes(pairs[r.id]))return false;
 const skill=skillIdentity(journey.companion);const marks=skill&&((skill.egg==='egg6'&&[0,1,4].includes(skill.index))||(skill.egg==='egg3'&&[1,3,5].includes(skill.index)));
 return !['markCompass','pin'].includes(r.id)||marks||owned.includes('seal');}
function relicOffers(n=3,epic=false){const pool=RELIC_V1.filter(r=>relicEligible(r));const result=[];while(pool.length&&result.length<n){const grades=['Common','Rare','Epic'];let grade;if(epic&&result.length===0&&pool.some(r=>r.grade==='Epic'))grade='Epic';else{const roll=rng()*100;grade=roll<60?'Common':roll<90?'Rare':'Epic';}let eligible=pool.filter(r=>r.grade===grade);if(!eligible.length)eligible=pool;const chosen=eligible[Math.floor(rng()*eligible.length)];result.push(chosen.id);pool.splice(pool.indexOf(chosen),1);}return result;}
