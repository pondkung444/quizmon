"use client";
import {useEffect,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {GARDEN_BLUEPRINT,type BlueprintDiscovery} from '@/lib/farm/blueprints';
import type {SchoolPet} from '@/lib/farm/school';
import GardenPathPuzzle from './GardenPathPuzzle';
import styles from './learning.module.css';
export default function GardenLesson({schoolPlaced,pets,initialDiscovery}:{schoolPlaced:boolean;pets:SchoolPet[];initialDiscovery:BlueprintDiscovery|null}){
 const [phase,setPhase]=useState<'pick'|'play'|'result'>('pick'),[petId,setPetId]=useState(pets[0]?.id??'');
 const [discovery,setDiscovery]=useState(initialDiscovery),[review,setReview]=useState(!!initialDiscovery);
 useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
 const pet=pets.find(p=>p.id===petId);
 return <section className={styles.lessonScreen}>
  <header className={styles.lessonHeader}><Link href="/collection/school/learn">← สมุดแบบ</Link><h1>{phase==='play'?'ทางเดินในสวน':'สวนพักผ่อน'}</h1><span>ไม่จับเวลา</span></header>
  {!schoolPlaced||!pets.length?<div className={styles.pickContent}><Image src={GARDEN_BLUEPRINT.image} width={360} height={330} alt="ภาพแบบสวนพักผ่อน" className={styles.pickArt} priority/><h2>มาทำโรงเรียนให้พร้อมกันก่อน</h2><p>{!schoolPlaced?'วางโรงเรียนในฟาร์มก่อน จึงเริ่มเรียนเพื่อค้นพบแบบได้':'เลี้ยงคู่หูจนฟักเป็นตัวระยะ 2 ก่อน แล้วมาเรียนด้วยกัน'}</p><Link className={styles.primary} href={!schoolPlaced?'/collection/school':'/pet'}>{!schoolPlaced?'ไปโรงเรียน →':'ไปเลี้ยงคู่หู →'}</Link></div>:
   phase==='pick'?<div className={styles.pickContent}>
    <Image src={GARDEN_BLUEPRINT.image} width={360} height={330} alt="สวนพักผ่อนที่เราจะค้นพบแบบ" className={styles.pickArt} priority/>
    <h2>{discovery?'กลับมาเดินเล่นในสวน':'ต่อทางให้คู่หูไปนั่งพัก'}</h2><p>เลือกบล็อกทางเดินมาวาง แตะหมุนให้ต่อกัน แล้วกดให้ Qmon เดินไปม้านั่ง</p>
    <div className={styles.petChoices} aria-label="เลือก Qmon มาเรียน">{pets.map(p=><button key={p.id} aria-pressed={petId===p.id} onClick={()=>setPetId(p.id)}><Image src={p.imagePath} width={48} height={48} alt=""/><span><strong>{p.name}</strong><small>ระยะ {p.stage} · ไปนั่งพักด้วยกัน</small></span>{petId===p.id&&<b>✓</b>}</button>)}</div>
    <button className={styles.primary} disabled={!pet} onClick={()=>setPhase('play')}>{discovery?'เล่นอีกครั้งกับ ':'เข้าสวนกับ '}{pet?.name}</button>
   </div>:
   phase==='play'&&pet?<GardenPathPuzzle pet={pet} onDiscovered={(found,created)=>{setReview(!created);setDiscovery(found);setPhase('result');}}/>:
   <div className={styles.pickContent}><span className={styles.resultBadge}>{review?'✓ กลับมาพักผ่อนสำเร็จ':'✦ ค้นพบแบบใหม่!'}</span><Image src={GARDEN_BLUEPRINT.image} width={360} height={330} alt="แบบสวนพักผ่อนที่ค้นพบแล้ว" className={styles.pickArt}/><h2>สวนพักผ่อน Qmon</h2><p>{review?'แบบสวนเดิมยังอยู่ในสมุดของเรา':'บันทึกแบบสวนไว้ในสมุดของเราแล้ว'} · {pet?.name} เดินถึงม้านั่งแล้ว</p><div className={styles.notice}><strong>ขั้นถัดไปคือสร้างสวนในฟาร์ม</strong><p>ใช้แบบที่ค้นพบซื้อโครงการ เลือกคู่หูคุมงาน แล้ววางสวนต่อกับฟาร์ม</p><Link href='/collection/garden'>ซื้อโครงการและสร้างสวน →</Link><Link href="/collection/garden-plan">ดูตัวอย่างการวางสวน →</Link></div><Link className={styles.primary} href="/collection/school/learn">เปิดสมุดแบบสร้าง →</Link><button className={styles.secondary} onClick={()=>setPhase('pick')}>เล่นทางเดินอีกครั้ง</button></div>}
 </section>;
}
