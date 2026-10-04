"use client";
import {useEffect,useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {schoolCommand} from "@/app/collection/school/actions";
import {schoolDisplayState,SCHOOL_LABELS,type SchoolProject,type SchoolPet} from "@/lib/farm/school";
import type {FloorPlacement} from "@/lib/farm/floor-puzzle";
import FloorPuzzle from "./FloorPuzzle";
import styles from "./school.module.css";

export default function SchoolClient({initialProject,pets,serverNow}:{initialProject:SchoolProject|null;pets:SchoolPet[];serverNow:string}) {
  const [project,setProject]=useState(initialProject);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [practice,setPractice]=useState(false);
  const [clock,setClock]=useState(()=>Date.parse(serverNow));
  const [anchor,setAnchor]=useState(()=>({server:Date.parse(serverNow),local:Date.now()}));
  useEffect(()=>{const timer=setInterval(()=>setClock(anchor.server+Date.now()-anchor.local),500);return()=>clearInterval(timer);},[anchor]);
  const state=schoolDisplayState(project,clock);
  const status=state?.status ?? "draft";
  const seconds=state?.ready_at?Math.max(0,Math.ceil((Date.parse(state.ready_at)-clock)/1000)):0;
  const roundSeconds=state?.round_deadline?Math.max(0,Math.ceil((Date.parse(state.round_deadline)-clock)/1000)):null;
  const leader=pets.find(p=>p.id===state?.leader_id);
  const progressStatus=status==="paused"?state?.resume_status:status;
  const step=progressStatus==="draft"?0:progressStatus==="building"?1:progressStatus==="puzzle"?2:progressStatus==="finishing"?3:4;
  async function command(operation:string,input:{petId?:string;layout?:FloorPlacement[]}={}) {
    if(busy)return;setBusy(true);setMessage("");
    try {
      const result=await schoolCommand(operation,input);
      if(result.error){setMessage(result.error);return;}
      if(result.project)setProject(result.project);
      if(result.serverNow){const now=Date.parse(result.serverNow);setClock(now);setAnchor({server:now,local:Date.now()});}
      setMessage(result.message ?? "");setPractice(false);setSelected("");
    } catch {setMessage("เชื่อมต่อไม่สำเร็จ ลองใหม่ได้ ความคืบหน้าเดิมยังอยู่");}
    finally {setBusy(false);}
  }
  return <section className={styles.school}>
    <header className={styles.hero}><Image src="/farm/qmon-school-l1-v1.webp" width={180} height={180} alt="โรงเรียนหลังคาสีเขียวอมฟ้า ตราหนังสือ" priority/><div><h1>โรงเรียนของเรา</h1><p>ระดับ 1 · โครงการแรก</p><strong>{SCHOOL_LABELS[status]}</strong></div></header>
    <ol className={styles.steps} aria-label="ขั้นตอนสร้างโรงเรียน">{["คุมงาน","เตรียมพื้น","จัดพื้น","เก็บงาน","วางโรงเรียน"].map((name,index)=><li key={name} aria-current={index===step?"step":undefined}>{index<step?"✓":index+1} {name}</li>)}</ol>
    {(status==="draft"||status==="paused") && <div className={styles.panel}>
      <h2>{status==="paused"?"เลือกหัวหน้าเพื่อทำงานต่อ":"เลือก Qmon คุมงาน"}</h2>
      <p>หัวหน้า 1 ตัว · ใช้ Qmon ที่ฟักแล้วได้ทุกระยะ · ตัวที่ติดผจญภัยยังรับงานไม่ได้</p>
      {status==="draft" && <p>บทสอนสร้างโรงเรียนฟรี ใช้เวลาประมาณ 3–5 นาที รวมเวลาช่วยจัดพื้น</p>}
      {status==="paused" && <p>ความคืบหน้ายังอยู่ เลือกตัวเดิมหรือตัวใหม่ได้</p>}
      <div className={styles.petList}>{pets.map(pet=><button key={pet.id} type="button" disabled={busy||pet.busy} aria-pressed={selected===pet.id} className={styles.pet} onClick={()=>setSelected(pet.id)}>
        <Image src={pet.imagePath} width={68} height={68} alt=""/><span><strong>{pet.name}</strong><small>ระยะ {pet.stage} · {pet.busy?"ติดงานผจญภัย":"พร้อมคุมงาน"}</small></span>{selected===pet.id && <b>✓</b>}
      </button>)}</div>
      {pets.length===0?<p>ยังไม่มี Qmon ที่ฟักเป็นตัว เลี้ยงคู่หูจนเป็นระยะ 2 ก่อน แล้วกลับมาเลือกหัวหน้าคุมงาน <Link href="/pet">ไปเลี้ยงคู่หู →</Link></p>:<button className={styles.primary} disabled={busy||!selected} onClick={()=>command(status==="draft"?"start":"resume",{petId:selected})}>{busy?"กำลังบันทึก…":status==="draft"?"เริ่มสร้างโรงเรียน":"กลับมาคุมงานต่อ"}</button>}
    </div>}
    {leader && <div className={styles.leader}><Image src={leader.imagePath} width={56} height={56} alt=""/><div><strong>{leader.name}</strong><p>หัวหน้าคุมงาน · ยังตอบโจทย์และเล่นประลองได้</p></div></div>}
    {(status==="building"||status==="finishing") && <div className={styles.panel}>
      <h2>{status==="building"?"Qmon กำลังเตรียมห้องเรียน":"พื้นเสร็จแล้ว กำลังเก็บงานโรงเรียน"}</h2>
      <p className={styles.timer}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")}</p>
      <p>{status==="building"?"เวลาจนพร้อมให้ช่วยจัดพื้น ครบแล้วงานจะรอเรา กลับมาช้าก็ไม่เสียความคืบหน้า":"เวลาจนโรงเรียนพร้อมวางในฟาร์ม"}</p>
    </div>}
    {status==="puzzle" && <div className={styles.panel}>
      <h2>ช่วย Qmon จัดพื้นห้องเรียน</h2><p>ปูพื้น 4 × 4 ให้เต็มด้วยแผ่นทั้ง 4 ชิ้น ห้ามซ้อนกัน</p>
      {state?.penalty_applied && <p className={styles.notice}>ลองใหม่ได้เลย ช่วงเก็บงานจะเพิ่ม 15 วินาทีครั้งเดียว เพราะผิดครบ 3 ครั้ง</p>}
      {state?.round_deadline && !practice?<>
        <p className={styles.timer}>เวลารอบนี้ {roundSeconds} วินาที</p>
        {roundSeconds===0?<><p>หมดเวลารอบนี้ ตรวจผลแล้วเริ่มรอบใหม่ได้เลย</p><button className={styles.primary} disabled={busy} onClick={()=>command("submit",{layout:[]})}>รับคำใบ้และลองใหม่</button></>:
          <FloorPuzzle key={state.round_deadline} busy={busy} practice={false} onSubmit={layout=>command("submit",{layout})}/>}
      </>:<>
        <div className={styles.buttons}><button disabled={busy} onClick={()=>setPractice(value=>!value)}>{practice?"ปิดรอบฝึก":"ลองจัดพื้นก่อน · ไม่จับเวลา"}</button><button disabled={busy} className={styles.primary} onClick={()=>command("begin")}>เริ่มช่วยจัดพื้น · 90 วินาที</button></div>
        {practice && <FloorPuzzle busy={false} practice onSubmit={()=>{}}/>}
      </>}
    </div>}
    {status==="ready" && <div className={styles.panel}><h2>โรงเรียนสร้างเสร็จแล้ว!</h2><p>เลือกพื้นที่ว่างที่เชื่อมกับฟาร์ม เพื่อวางโรงเรียนของเรา หัวหน้าว่างจากงานนี้แล้ว</p><Link className={styles.primary} href="/collection?place=school">เลือกที่วางในฟาร์ม →</Link></div>}
    {status==="placed" && <div className={styles.panel}><h2>โรงเรียนระดับ 1 พร้อมแล้ว</h2><p>เราช่วย Qmon ปูพื้นและสร้างโรงเรียนสำเร็จ โรงเรียนระดับต่อไปและการค้นพบแบบสร้างจะมาในเฟสถัดไป</p><Link className={styles.primary} href="/collection">กลับไปดูโรงเรียนในฟาร์ม →</Link></div>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {["building","puzzle","finishing"].includes(status) && <button disabled={busy} className={styles.withdraw} onClick={()=>command("pause")}>ถอนหัวหน้าและพักงาน · เก็บความคืบหน้าไว้</button>}
  </section>;
}
