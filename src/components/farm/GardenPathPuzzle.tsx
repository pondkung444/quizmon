"use client";
import {useEffect,useRef,useState,type PointerEvent} from 'react';
import Image from 'next/image';
import {completeGardenLesson} from '@/app/collection/school/learn/actions';
import {GARDEN_PIECES,GARDEN_START,GARDEN_BLOCKED,validateGardenPath,type GardenPlacement,type GardenPoint} from '@/lib/farm/garden-path';
import type {SchoolPet} from '@/lib/farm/school';
import type {BlueprintDiscovery} from '@/lib/farm/blueprints';
import styles from './garden-path.module.css';
function Road({kind,rotation}:{kind:string;rotation:number}){
 return <svg viewBox="0 0 100 100" aria-hidden="true" className={styles.road} style={{transform:`rotate(${rotation*90}deg)`}}><path d={kind==='straight'?'M50 -8 V108':'M50 -8 V50 H108'} fill="none" stroke="#665638" strokeWidth="43" strokeLinejoin="round"/><path d={kind==='straight'?'M50 -8 V108':'M50 -8 V50 H108'} fill="none" stroke="#e4c896" strokeWidth="35" strokeLinejoin="round"/><path d={kind==='straight'?'M34 14 H66 M34 38 H66 M34 62 H66 M34 86 H66':'M34 15 H66 M34 37 H66 M66 34 V66 M86 34 V66'} stroke="#b49566" strokeWidth="2"/><path d={kind==='straight'?'M43 14 V38 M58 38 V62 M43 62 V86':'M44 15 V37 M66 45 H86'} stroke="#b49566" strokeWidth="2"/></svg>;
}
function Bench(){return <svg viewBox="0 0 100 100" aria-hidden="true" className={styles.decor}><path d="M21 57 V84 M79 57 V84" stroke="#543b2b" strokeWidth="8"/><path d="M18 39 H82 M18 51 H82 M13 65 H87" stroke="#c9904f" strokeWidth="10" strokeLinecap="round"/><path d="M20 28 V58 M80 28 V58" stroke="#65472b" strokeWidth="6"/><path d="M20 33 H80" stroke="#efd195" strokeWidth="3"/></svg>;}
function GardenDecor({pond}:{pond:boolean}){return pond?<svg viewBox="0 0 100 100" aria-hidden="true" className={styles.decor}><ellipse cx="50" cy="52" rx="42" ry="35" fill="#6c8a63"/><ellipse cx="50" cy="52" rx="35" ry="28" fill="#4eb7bc"/><path d="M29 47 Q40 41 51 47 M46 65 Q57 58 71 63" fill="none" stroke="#b3f0e0" strokeWidth="3"/><ellipse cx="70" cy="42" rx="10" ry="5" fill="#739d4c"/></svg>:<svg viewBox="0 0 100 100" aria-hidden="true" className={styles.decor}><path d="M51 39 V86" stroke="#8e6334" strokeWidth="12"/><circle cx="34" cy="43" r="23" fill="#558846"/><circle cx="67" cy="43" r="24" fill="#6b9a4c"/><circle cx="50" cy="27" r="26" fill="#8caf51"/><circle cx="40" cy="24" r="11" fill="#aec564"/></svg>;}
export default function GardenPathPuzzle({pet,onDiscovered,practice=false}:{pet:SchoolPet;practice?:boolean;onDiscovered?:(discovery:BlueprintDiscovery,created:boolean)=>void}){
 const [layout,setLayout]=useState<GardenPlacement[]>([]),[selected,setSelected]=useState<string>(GARDEN_PIECES[0].id),[rotation,setRotation]=useState(0);
 const [hint,setHint]=useState('เลือกชิ้นจากถาด แล้วแตะช่องหญ้า · แตะทางเดินเพื่อหมุน');
 const [busy,setBusy]=useState(false),[seated,setSeated]=useState(false),[position,setPosition]=useState<GardenPoint>(GARDEN_START),[stop,setStop]=useState<GardenPoint|null>(null),[ghost,setGhost]=useState<GardenPoint|null>(null);
 const [walk,setWalk]=useState<{path:GardenPoint[];valid:boolean;message:string}|null>(null);
 const result=useRef<{discovery:BlueprintDiscovery;created:boolean}|null>(null);
 const board=useRef<HTMLDivElement>(null),suppress=useRef(false),tapRotate=useRef<boolean|null>(null);
 const gesture=useRef<{id:string;r:number;sx:number;sy:number;moved:boolean;placed:boolean}|null>(null);
 const locked=busy||!!walk||seated;
 useEffect(()=>{if(!practice)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;};},[practice]);
 useEffect(()=>{
  if(!walk)return;
  let index=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timer=window.setInterval(()=>{
   index=reduced?walk.path.length-1:Math.min(index+1,walk.path.length-1);setPosition(walk.path[index]);
   if(index===walk.path.length-1){window.clearInterval(timer);setHint(walk.message);setStop(walk.valid?null:walk.path[index]);setSeated(walk.valid);setWalk(null);}
  },reduced?50:450);
  return()=>window.clearInterval(timer);
 },[walk]);
 function edit(){setPosition(GARDEN_START);setStop(null);setHint('วางแล้ว · แตะทางเดินเพื่อหมุน หรือลากย้าย');}
 function place(x:number,y:number,id=selected,r=rotation){
  if(locked)return;
  if(x<0||x>3||y<0||y>3||GARDEN_BLOCKED.includes(x+','+y)||(x===0&&y===3)||(x===3&&y===0)){setHint('วางได้เฉพาะช่องหญ้าว่าง');return;}
  if(layout.some(p=>p.id!==id&&p.x===x&&p.y===y)){setHint('ช่องนี้มีทางอยู่แล้ว ย้ายหรือยกชิ้นเดิมก่อน');return;}
  setLayout(old=>[...old.filter(p=>p.id!==id),{id,x,y,rotation:r}]);edit();
 }
 function rotate(id=selected){if(locked)return;const p=layout.find(p=>p.id===id),r=((p?.rotation??rotation)+1)%4;setSelected(id);setRotation(r);if(p)setLayout(old=>old.map(t=>t.id===id?{...t,rotation:r}:t));edit();}
 function cell(e:PointerEvent){const b=board.current!.getBoundingClientRect();return {x:Math.floor((e.clientX-b.left)/b.width*4),y:Math.floor((e.clientY-b.top)/b.height*4)};}
 function down(e:PointerEvent<HTMLButtonElement>,id:string,placed:boolean){if(locked||!e.isPrimary||e.button!==0)return;const r=layout.find(p=>p.id===id)?.rotation??(selected===id?rotation:0);tapRotate.current=placed||id===selected;setSelected(id);setRotation(r);suppress.current=false;gesture.current={id,r,sx:e.clientX,sy:e.clientY,moved:false,placed};e.currentTarget.setPointerCapture(e.pointerId);}
 function move(e:PointerEvent<HTMLButtonElement>){const g=gesture.current;if(!g)return;if(Math.hypot(e.clientX-g.sx,e.clientY-g.sy)>7)g.moved=true;if(g.moved){const p=cell(e);setGhost(p.x>=0&&p.x<4&&p.y>=0&&p.y<4?p:null);}}
 function up(e:PointerEvent<HTMLButtonElement>){const g=gesture.current;if(!g)return;if(g.moved){const p=cell(e);if(p.x>=0&&p.x<4&&p.y>=0&&p.y<4)place(p.x,p.y,g.id,g.r);else if(g.placed){setLayout(old=>old.filter(t=>t.id!==g.id));edit();setHint('ยกกลับถาดแล้ว');}suppress.current=true;}gesture.current=null;setGhost(null);}
 const handlers=(id:string,placed:boolean)=>({onPointerDown:(e:PointerEvent<HTMLButtonElement>)=>down(e,id,placed),onPointerMove:move,onPointerUp:up,onPointerCancel:()=>{gesture.current=null;setGhost(null);suppress.current=true;}});
 function click(id:string,placed:boolean){if(suppress.current){suppress.current=false;tapRotate.current=null;return;}const shouldRotate=tapRotate.current??(placed||id===selected);tapRotate.current=null;if(shouldRotate)rotate(id);else{setSelected(id);setRotation(layout.find(p=>p.id===id)?.rotation??0);}}
 function reset(){setLayout([]);setSeated(false);setSelected(GARDEN_PIECES[0].id);setRotation(0);result.current=null;edit();}
 async function walkToBench(){
  if(locked)return;setBusy(true);setStop(null);setPosition(GARDEN_START);setHint('กำลังตรวจทางเดิน…');
  try{const r:Awaited<ReturnType<typeof completeGardenLesson>>=practice?validateGardenPath(layout):await completeGardenLesson(pet.id,layout);if(r.error){setHint(r.error);return;}if(r.path){if(r.discovery)result.current={discovery:r.discovery,created:!!r.created};setWalk({path:r.path,valid:!!r.valid,message:r.message??''});setHint('คู่หูกำลังลองเดินตามทาง…');}}
  catch{setHint('เชื่อมต่อไม่สำเร็จ ทางที่จัดยังอยู่ กดเดินอีกครั้งได้');}finally{setBusy(false);}
 }
 return <div className={styles.game}>
  <div className={styles.guide}><h2>ต่อทางไปม้านั่ง</h2><p>ใช้ทางทั้ง 5 ชิ้น · เริ่มด้านขวาของคู่หู → เข้าหน้าม้านั่ง</p></div>
  <div className={styles.gardenArea}><div ref={board} className={styles.board} aria-label="สวน 4 แถว 4 ช่อง">
   {Array.from({length:16},(_,i)=>{const x=i%4,y=Math.floor(i/4),p=layout.find(p=>p.x===x&&p.y===y),blocked=GARDEN_BLOCKED.includes(x+','+y),start=x===0&&y===3,bench=x===3&&y===0;
    return <div key={i} className={[styles.cell,blocked?styles.blocked:'',stop?.x===x&&stop?.y===y?styles.stop:''].join(' ')} style={{gridColumn:x+1,gridRow:y+1}}>
     {blocked?<GardenDecor pond={x===0}/>:bench?<><span className={styles.benchPath}/><Bench/><small>ม้านั่ง ↓</small></>:start?<><span className={styles.startPath}/><small>เริ่ม →</small></>:p?<button type="button" disabled={locked} className={[styles.tile,selected===p.id?styles.selected:''].join(' ')} {...handlers(p.id,true)} onClick={()=>click(p.id,true)} aria-label={'ทาง'+(p.id.startsWith('straight')?'ตรง':'โค้ง')+' แถว '+(y+1)+' ช่อง '+(x+1)+' แตะหมุน ลากย้าย'}><Road kind={GARDEN_PIECES.find(t=>t.id===p.id)!.kind} rotation={p.rotation}/><b aria-hidden="true">↻</b></button>:<button type="button" disabled={locked} className={styles.empty} onClick={()=>{if(suppress.current){suppress.current=false;tapRotate.current=null;return;}place(x,y);}} data-garden-cell={x+','+y} aria-label={'วางทาง แถว '+(y+1)+' ช่อง '+(x+1)}><span aria-hidden="true">＋</span></button>}
     {ghost?.x===x&&ghost?.y===y&&<span className={styles.ghost}/>}
    </div>;
   })}
   <div className={[styles.qmon,seated?styles.seated:''].join(' ')} style={{left:(position.x+.5)*25+'%',top:(position.y+.5)*25+'%'}}><Image src={pet.imagePath} width={70} height={70} alt={pet.name+(seated?'นั่งพักบนม้านั่ง':walk?'กำลังเดินตามทาง':'รอที่ทางเดิน')} priority/>{seated&&<span>พักสบายเลย ✦</span>}</div>
  </div></div>
  <div className={styles.controls}><div className={styles.trayHeading}><strong>บล็อกทางเดิน {layout.length}/5</strong><span>แตะเลือก · แตะซ้ำหมุน · ลากวาง</span></div>
   <div className={styles.tray} aria-label="ถาดทางเดิน 5 ชิ้น">{GARDEN_PIECES.map((piece,i)=>{const p=layout.find(p=>p.id===piece.id);return <button key={piece.id} type="button" disabled={locked} aria-pressed={selected===piece.id} {...handlers(piece.id,false)} onClick={()=>click(piece.id,false)} aria-label={'ชิ้น '+(i+1)+' ทาง'+(piece.kind==='straight'?'ตรง':'โค้ง')+(p?' วางแล้ว':' ในถาด')}><Road kind={piece.kind} rotation={p?.rotation??(selected===piece.id?rotation:0)}/><span>{p?'✓ วางแล้ว':piece.kind==='straight'?'ทางตรง':'ทางโค้ง'}</span></button>;})}</div>
   <div className={styles.tools}><button disabled={locked} onClick={()=>rotate()}>↻ หมุน</button><button disabled={locked||!layout.some(p=>p.id===selected)} onClick={()=>{setLayout(old=>old.filter(p=>p.id!==selected));edit();}}>ยกออก</button><button disabled={busy||!!walk||!layout.length} onClick={reset}>จัดใหม่</button></div>
   <p role="status" className={styles.hint}>{hint}</p>
   {seated?<button className={styles.primary} onClick={()=>{if(practice){reset();return;}if(result.current)onDiscovered?.(result.current.discovery,result.current.created);}}>{practice?'เล่นทางเดินอีกครั้ง':'เก็บแบบสวน · ดูผลสำเร็จ ✦'}</button>:<button className={styles.primary} disabled={locked||!layout.length} onClick={walkToBench}>{busy?'กำลังตรวจ…':walk?'Qmon กำลังเดิน…':'เดินไปม้านั่ง →'}</button>}
  </div>
 </div>;
}
