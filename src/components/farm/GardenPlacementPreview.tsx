"use client";
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import FarmWorld from './FarmWorld';
import {gardenCommand} from '@/app/collection/garden/actions';
import {useRouter} from 'next/navigation';
import type {FarmPet} from './FarmMeadow';
import {attachFarmTile,type FarmTile} from '@/lib/farm/world';
import styles from './garden-placement.module.css';
export default function GardenPlacementPreview({tiles,pets,projectId}:{tiles:FarmTile[];pets:FarmPet[];projectId?:string}){
 const router=useRouter();const [saving,setSaving]=useState(false);
 const [point,setPoint]=useState<{x:number;y:number}|null>(null),[placed,setPlaced]=useState(false),[message,setMessage]=useState('');
 const garden=useMemo<FarmTile|null>(()=>point?{id:projectId??'garden-layout-example',kind:'garden',level:1,...point}:null,[point,projectId]);
 const shownTiles=useMemo(()=>placed&&garden?attachFarmTile(tiles,garden):tiles,[placed,garden,tiles]);
 useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
 function reset(){setPlaced(false);setPoint(null);setMessage('');}
 async function confirm(){
  if(!garden||saving)return;
  try{attachFarmTile(tiles,garden);if(projectId){setSaving(true);const r=await gardenCommand('place',{projectId,x:garden.x,y:garden.y});if(r.error){setMessage(r.error);return;}router.replace('/collection');router.refresh();}else setPlaced(true);}
  catch{setMessage('บันทึกไม่สำเร็จ จุดที่เลือกยังอยู่ ลองใหม่ได้');}finally{setSaving(false);}
 }
 return <section className={styles.screen}>
  <header className={styles.header}><Link href="/collection">← ฟาร์มจริง</Link><h1>{projectId?'วางสวนของเรา':'ลองวางสวน'}</h1><span>{projectId?'สร้างเสร็จแล้ว':'ตัวอย่าง'}</span></header>
  <div className={styles.intro}><h2>สวนเพิ่มเป็นชิ้นใหม่ ต่อกับขอบฟาร์ม</h2><p>ไม่วางทับลานเดิม · แตะช่อง ＋ ดูภาพก่อน แล้วค่อยยืนยัน</p>{!projectId&&<details><summary>ก่อนวางสวน ต้องทำอะไรบ้าง?</summary><ol><li>เรียนกับ Qmon ที่โรงเรียน เพื่อค้นพบแบบสวน</li><li>เริ่มโครงการ เลือกคู่หูคุมงาน และกลับมาช่วยต่อทางเมื่อพร้อม</li><li>สวนสร้างเสร็จแล้ว เลือกตำแหน่งต่อกับฟาร์ม</li></ol><p>ตัวอย่างนี้ทดลองขั้นวางหลังสร้างเสร็จ ระบบซื้อโครงการและก่อสร้างสวนเปิดแล้ว เข้าไปเริ่มได้จากสมุดแบบสร้าง</p></details>}</div>
  <div className={styles.map}><FarmWorld tiles={shownTiles} pets={pets} paused={false} focusedId={null} onSelect={()=>{}} placementLabel="สวน" previewTile={!placed?garden:null} onPlaceTile={!placed&&!saving?(x,y)=>{setPoint({x,y});setMessage('');}:undefined}/></div>
  <footer className={styles.footer}>
   <p role="status">{message||(placed?'สวนต่อกับฟาร์มแล้วในตัวอย่าง คู่หูเดินข้ามพื้นที่ได้':point?'ภาพสวน ณ จุดที่เลือก · เปลี่ยนจุดได้ก่อนยืนยัน':'เลือกช่อง ＋ ที่ติดกับขอบฟาร์ม เพื่อดูสวนก่อนวาง')}</p>
   <div>{placed?<button className={styles.primary} onClick={reset}>ลองจุดอื่น</button>:<><button className={styles.secondary} disabled={!point||saving} onClick={reset}>ล้างจุด</button><button className={styles.primary} disabled={!garden||saving} onClick={confirm}>{saving?'กำลังวางสวน…':projectId?'วางสวนตรงนี้':'ลองวางสวนตรงนี้'}</button></>}</div>
   <small>{projectId?'ยืนยันแล้วสวนจะอยู่ในฟาร์มจริง ไม่หักเหรียญเพิ่ม':'เป็นตัวอย่างเท่านั้น ยังไม่บันทึกสวนหรือเปลี่ยนความคืบหน้าฟาร์มจริง'}{pets.some(p=>p.id.startsWith('example-'))?' · ใช้ Qmon ตัวอย่างแสดงพื้นที่เดิน':''}</small>
  </footer>
 </section>;
}
