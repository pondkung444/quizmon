
"use client";
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {gardenCommand} from '@/app/collection/garden/actions';
import type {GardenProject,FarmWallet} from '@/lib/farm/garden';
import {schoolDisplayState,type SchoolPet} from '@/lib/farm/school';
import {validateGardenPath,type GardenPlacement} from '@/lib/farm/garden-path';
import GardenPathPuzzle from './GardenPathPuzzle';
import styles from './school.module.css';
import learning from './learning.module.css';
export default function GardenClient({initialProjects,wallet,pets,unlocked,serverNow}:{initialProjects:GardenProject[];wallet:FarmWallet;pets:SchoolPet[];unlocked:boolean;serverNow:string}){
 const router=useRouter();const pending=useRef<GardenProject|null>(null);const [accepted,setAccepted]=useState(false);
 const [projects,setProjects]=useState(initialProjects),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[playing,setPlaying]=useState(false);
 const [requestId]=useState(()=>crypto.randomUUID());
 const [anchor,setAnchor]=useState(()=>({server:Date.parse(serverNow),local:Date.now()})),[clock,setClock]=useState(()=>Date.parse(serverNow));
 useEffect(()=>{const t=setInterval(()=>setClock(anchor.server+Date.now()-anchor.local),500);return()=>clearInterval(t);},[anchor]);
 useEffect(()=>{if(!playing)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[playing]);
 const raw=projects.find(p=>p.status!=='placed'),project=raw?schoolDisplayState(raw,clock) as GardenProject:null;
 const leader=pets.find(p=>p.id===project?.leader_id);
 const seconds=project?.ready_at?Math.max(0,Math.ceil((Date.parse(project.ready_at)-clock)/1000)):0;
 const round=project?.round_deadline?Math.max(0,Math.ceil((Date.parse(project.round_deadline)-clock)/1000)):0;
 async function command(operation:string,input:{petId?:string;layout?:GardenPlacement[]}={},defer=false){
  if(busy)return {error:'กำลังบันทึก'};setBusy(true);setMessage('');
  try{const r=await gardenCommand(operation,{projectId:project?.id,requestId,...input});
   if(r.error){setMessage(r.error);return r;}
   if(r.project){if(defer)pending.current=r.project;else setProjects(old=>[r.project!,...old.filter(p=>p.id!==r.project!.id)]);}
   if(r.serverNow){const now=Date.parse(r.serverNow);setClock(now);setAnchor({server:now,local:Date.now()});}
   setMessage(r.message??'');if(['buy','pause','resume'].includes(operation))router.refresh();return r;
  }catch{const r={error:'เชื่อมต่อไม่สำเร็จ ลองใหม่ได้ ความคืบหน้ายังอยู่'};setMessage(r.error);return r;}finally{setBusy(false);}
 }
 function applyPending(){const next=pending.current;if(next){setProjects(old=>[next,...old.filter(p=>p.id!==next.id)]);pending.current=null;}setAccepted(false);setPlaying(false);}
 const choices=<div className={styles.petList}>{pets.map(p=><button key={p.id} type="button" className={styles.pet} disabled={busy||p.busy} aria-pressed={selected===p.id} onClick={()=>setSelected(p.id)}><Image src={p.imagePath} width={60} height={60} alt=""/><span><strong>{p.name}</strong><small>ระยะ {p.stage} · {p.busy?'ติดงานอื่น':'พร้อมคุมงาน'}</small></span>{selected===p.id&&'✓'}</button>)}</div>;
 if(playing&&project?.status==='puzzle'&&leader)return <section className={learning.lessonScreen}><header className={learning.lessonHeader}><button onClick={()=>pending.current?applyPending():setPlaying(false)}>← กลับ</button><h1>ช่วยต่อทางสวน</h1><span>{accepted?"✓ ผ่านแล้ว":`${round} วินาที`}</span></header>{round===0&&!accepted?<div className={learning.pickContent}><h2>หมดเวลารอบนี้</h2><p>รับคำใบ้แล้วเริ่มใหม่ได้ ความคืบหน้าโครงการยังอยู่</p><button disabled={busy} className={styles.primary} onClick={async()=>{await command('submit',{layout:[]});setPlaying(false);}}>รับคำใบ้และลองใหม่</button></div>:<GardenPathPuzzle key={project.round_deadline} pet={leader} onCheck={async layout=>{const checked=validateGardenPath(layout);const r=await command('submit',{layout},true);setAccepted(!!r.passed);if(r.error)return {error:r.error};return {...checked,valid:!!r.passed,message:r.message??checked.message};}} onWalkFinished={valid=>{if(!valid)applyPending();}} onBuilt={applyPending}/>}</section>;
 return <section className={styles.school}>
  <header className={styles.hero}><Image src="/farm/qmon-garden-pavilion-v1.webp" width={180} height={150} alt="ศาลาและม้านั่งสวนพักผ่อน" priority/><div><h1>สวนพักผ่อน</h1><p>เพิ่มพื้นที่ใหม่ให้คู่หูเดิน</p><strong>เหรียญฟาร์ม {wallet.balance.toLocaleString()}</strong></div></header>
  {!project?<div className={styles.panel}><h2>สร้างสวนใหม่ · {wallet.rules.garden_price} เหรียญ</h2><p>เตรียมสวน {wallet.rules.work_seconds/60} นาที → ช่วยต่อทาง → เก็บงาน {wallet.rules.finish_seconds/60} นาที → เลือกที่วาง</p><p>Daily Quest ได้ {wallet.rules.daily_coins} เหรียญ · โบนัสวางโรงเรียนและสวนครั้งแรกอย่างละ {wallet.rules.milestone_coins} เหรียญ · ค่าทดลอง</p>
   {!unlocked?<><p>ต้องวางโรงเรียนและเรียนเพื่อค้นพบแบบสวนก่อน</p><Link href="/collection/school/learn" className={styles.primary}>ไปสมุดแบบสร้าง →</Link></>:<><h2>เลือก Qmon คุมงาน</h2><p>หัวหน้า 1 ตัว · ระยะ 2–4 · ช่วงรอออกผจญภัยไม่ได้ แต่เล่นประลองได้</p>{choices}{!pets.length&&<Link href="/pet">ไปฟักคู่หูก่อน →</Link>}<button className={styles.primary} disabled={busy||!selected||wallet.balance<wallet.rules.garden_price} onClick={()=>command('buy',{petId:selected})}>{busy?'กำลังบันทึก…':`ซื้อและเริ่มสร้าง · ${wallet.rules.garden_price} เหรียญ`}</button>{wallet.balance<wallet.rules.garden_price&&<Link href="/quiz?mode=mission" className={styles.help}>เหรียญยังไม่พอ · ไปทำ Daily Quest →</Link>}</>}
  </div>:<>
   <ol className={styles.steps}><li>1 เตรียมสวน</li><li>2 ช่วยต่อทาง</li><li>3 เก็บงาน</li><li>4 วางสวน</li></ol>
   {leader&&<div className={styles.leader}><Image src={leader.imagePath} width={56} height={56} alt=""/><div><strong>{leader.name}</strong><p>หัวหน้าคุมงานสวน</p></div></div>}
   {project.status==='paused'?<div className={styles.panel}><h2>สวนพักอยู่ · ความคืบหน้ายังอยู่</h2>{choices}<button className={styles.primary} disabled={busy||!selected} onClick={()=>command('resume',{petId:selected})}>กลับมาคุมงานต่อ</button></div>:
    project.status==='building'||project.status==='finishing'?<div className={styles.panel}><h2>{project.status==='building'?'คู่หูกำลังเตรียมสวน':'ทางเสร็จแล้ว กำลังเก็บงาน'}</h2><p className={styles.timer}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</p><p>{project.status==='building'?'เวลาถึงจุดช่วยต่อทาง ครบแล้วงานหยุดรอเรา กลับมาช้าก็ไม่เสียความคืบหน้า':'เวลาจนสวนพร้อมวาง'}</p></div>:
    project.status==='puzzle'?<div className={styles.panel}><h2>พร้อมให้ช่วยต่อทางไปม้านั่ง</h2><p>เริ่มรอบแล้วมีเวลา {project.round_seconds} วินาที กลับออกมาเวลายังเดินอยู่ การวางหรือหมุนชิ้นยังไม่นับผิด</p>{project.penalty_applied&&<p>เก็บงานเพิ่ม {project.penalty_seconds} วินาทีครั้งเดียว เพราะผิดครบ 3 ครั้ง ลองต่อได้ทันที</p>}<button className={styles.primary} disabled={busy} onClick={async()=>{const r=await command('begin');if(!r.error){setAccepted(false);setPlaying(true);}}}>เริ่มช่วยต่อทาง</button></div>:
    <div className={styles.panel}><h2>สวนสร้างเสร็จแล้ว!</h2><p>หัวหน้าว่างแล้ว เลือกช่องติดฟาร์มเพื่อเพิ่มพื้นที่สวน</p><Link href={`/collection/garden/place?project=${project.id}`} className={styles.primary}>เลือกที่วางสวน →</Link></div>}
   {['building','puzzle','finishing'].includes(project.status)&&<button className={styles.secondary} disabled={busy} onClick={()=>command('pause')}>ถอนหัวหน้า · พักงานและเก็บความคืบหน้า</button>}
  </>}
  {message&&<p role="status" className={styles.notice}>{message}</p>}
  <h2>สวนที่วางแล้ว {projects.filter(p=>p.status==='placed').length} แห่ง</h2>{projects.filter(p=>p.status==='placed').map(p=><div key={p.id} className={styles.panel}><strong>สวนพักผ่อน · พิกัด {p.tile_x}, {p.tile_y}</strong><p>สร้างเสร็จ {p.completed_at?new Date(p.completed_at).toLocaleDateString('th-TH'):''}</p><Link href="/collection/school/learn/garden/practice">เข้าไปต่อทางเล่นอีกครั้ง →</Link></div>)}
 </section>;
}
