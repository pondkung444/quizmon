"use client";
import {useEffect,useState} from "react";
import Image from "next/image";
import Link from "next/link";
import {checkLessonStep,completeGardenLesson} from "@/app/collection/school/learn/actions";
import {GARDEN_LESSON,GARDEN_BLUEPRINT,type BlueprintDiscovery} from "@/lib/farm/blueprints";
import type {SchoolPet} from "@/lib/farm/school";
import styles from "./learning.module.css";
function GardenPlan({rows}:{rows:string[]}){
 const labels:Record<string,string>={H:"ศาลา",S:"เข้า",p:"",w:"น้ำ",".":""};
 return <span className={styles.plan} aria-hidden="true">{rows.flatMap((row,y)=>row.split("").map((cell,x)=><i key={x+","+y} className={cell==="p"||cell==="S"?styles.path:cell==="w"?styles.water:cell==="H"?styles.pavilion:styles.grass}>{labels[cell]}</i>))}</span>;
}
export default function GardenLesson({schoolPlaced,pets,initialDiscovery}:{schoolPlaced:boolean;pets:SchoolPet[];initialDiscovery:BlueprintDiscovery|null}){
 const [phase,setPhase]=useState<"pick"|"learn"|"result">("pick");
 const [petId,setPetId]=useState(pets[0]?.id??"");
 const [step,setStep]=useState(0),[choice,setChoice]=useState("");
 const [answers,setAnswers]=useState<string[]>([]);
 const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[hint,setHint]=useState("");
 const [discovery,setDiscovery]=useState(initialDiscovery);
 const [review,setReview]=useState(!!initialDiscovery);
 useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;};},[]);
 const pet=pets.find(p=>p.id===petId),question=GARDEN_LESSON[step];
 async function check(){
  if(!choice||busy)return;setBusy(true);setHint("");
  try{const r=await checkLessonStep(petId,step,choice);if(r.error){setHint(r.error);return;}setHint(r.hint??"");setChecked(!!r.correct);if(r.correct)setAnswers(a=>{const next=[...a];next[step]=choice;return next;});}
  catch{setHint("เชื่อมต่อไม่สำเร็จ ลองตรวจคำตอบอีกครั้งได้");}finally{setBusy(false);}
 }
 async function next(){
  if(!checked||busy)return;
  if(step<2){setStep(s=>s+1);setChoice(answers[step+1]??"");setChecked(false);setHint("");return;}
  setBusy(true);setHint("");
  try{const r=await completeGardenLesson(petId,answers);if(r.error){setHint(r.error);if(r.wrongStep!==undefined){setStep(r.wrongStep);setChoice(answers[r.wrongStep]??"");setChecked(false);}return;}
   if(r.discovery){setReview(!r.created);setDiscovery(r.discovery);setPhase("result");}
  }catch{setHint("บันทึกไม่สำเร็จ ลองอีกครั้งได้ คำตอบยังอยู่");}finally{setBusy(false);}
 }
 function restart(){setPhase("pick");setStep(0);setChoice("");setAnswers([]);setHint("");setChecked(false);}
 return <section className={styles.lessonScreen}>
  <header className={styles.lessonHeader}><Link href="/collection/school/learn">← สมุดแบบ</Link><h1>{phase==="learn"?"เรียนกับ Qmon":"สวนพักผ่อน"}</h1><span>{phase==="learn"?(step+1)+"/3":"ไม่จับเวลา"}</span></header>
  {!schoolPlaced||!pets.length?<div className={styles.pickContent}><Image src={GARDEN_BLUEPRINT.image} width={360} height={330} alt="ภาพแบบสวนพักผ่อน" className={styles.pickArt}/><h2>มาทำโรงเรียนให้พร้อมกันก่อน</h2><p>{!schoolPlaced?"วางโรงเรียนในฟาร์มก่อน จึงเริ่มเรียนเพื่อค้นพบแบบได้":"เลี้ยงคู่หูจนฟักเป็นตัวระยะ 2 ก่อน แล้วมาเรียนด้วยกัน"}</p><Link className={styles.primary} href={!schoolPlaced?"/collection/school":"/pet"}>{!schoolPlaced?"ไปโรงเรียน →":"ไปเลี้ยงคู่หู →"}</Link></div>:
   phase==="pick"?<div className={styles.pickContent}>
    <Image src={GARDEN_BLUEPRINT.image} width={360} height={330} alt="สวนพักผ่อนที่เราจะค้นพบแบบ" className={styles.pickArt}/>
    <h2>{discovery?"แบบสวนอยู่ในสมุดแล้ว":"ค้นพบแบบสวนแห่งแรก"}</h2><p>เรียนเรื่องทางเดิน มุมพัก และแปลงดอกไม้ 3 ช่วงสั้น ๆ เลือกคู่หูมาเรียนด้วยกัน</p>
    <div className={styles.petChoices} aria-label="เลือก Qmon มาเรียน">{pets.map(p=><button key={p.id} disabled={busy} aria-pressed={petId===p.id} onClick={()=>setPetId(p.id)}><Image src={p.imagePath} width={48} height={48} alt=""/><span><strong>{p.name}</strong><small>ระยะ {p.stage} · เรียนด้วยกันได้</small></span>{petId===p.id&&<b>✓</b>}</button>)}</div>
    <button className={styles.primary} disabled={!petId} onClick={()=>setPhase("learn")}>{discovery?"เริ่มทบทวนกับ "+pet?.name:"เริ่มเรียนกับ "+pet?.name}</button>
   </div>:
   phase==="learn"?<div className={styles.lessonContent}>
    <div className={styles.lessonSteps} aria-label={"บทเรียนช่วง "+(step+1)+" จาก 3"}>{GARDEN_LESSON.map((q,i)=><span key={q.id} className={i<=step?styles.activeStep:""}/>)}</div>
    <div className={styles.companion}><Image src={pet?.imagePath??"/farm/qmon-school-l1-v1.webp"} width={64} height={64} alt=""/><div><strong>{pet?.name}</strong><p>ลองคิดด้วยกัน แล้วเอาไปใช้ในสวนของเรา</p></div></div>
    <div className={styles.question}><h2>{question.title}</h2><p>{question.intro}</p></div>
    <div className={question.options[0].plan?styles.planChoices:styles.answerChoices} aria-label="เลือกคำตอบ">{question.options.map(o=><button key={o.id} type="button" aria-pressed={choice===o.id} disabled={busy||checked} onClick={()=>{setChoice(o.id);setHint("");}}>{o.plan&&<GardenPlan rows={o.plan}/>}<strong>{o.label}</strong><span>{o.detail}</span></button>)}</div>
    <p role="status" className={checked?styles.goodHint:styles.lessonHint}>{hint||"เลือกคำตอบ แล้วกดตรวจ · ลองใหม่ได้ ไม่เสียอะไร"}</p>
    <div className={styles.lessonFooter}>{step>0&&<button disabled={busy} className={styles.secondary} onClick={()=>{setStep(s=>s-1);setChoice(answers[step-1]??"");setChecked(false);setHint("");}}>ย้อนดู</button>}<button className={styles.primary} disabled={busy||!choice} onClick={checked?next:check}>{busy?"กำลังตรวจ…":checked?step===2?discovery?"บันทึกการทบทวน":"ค้นพบแบบสวน ✦":"ช่วงถัดไป →":"ตรวจคำตอบ"}</button></div>
   </div>:
   <div className={styles.pickContent}><span className={styles.resultBadge}>{review?"✓ ทบทวนครบแล้ว":"✦ ค้นพบแบบใหม่!"}</span><Image src={GARDEN_BLUEPRINT.image} width={360} height={330} alt="แบบสวนพักผ่อนที่ค้นพบแล้ว" className={styles.pickArt}/><h2>สวนพักผ่อน Qmon</h2><p>{review?"แบบสวนเดิมยังอยู่ในสมุดของเรา":"บันทึกแบบสวนไว้ในสมุดของเราแล้ว"} · เรียนกับ {pet?.name}</p><div className={styles.notice}><strong>ขั้นถัดไปคือสร้างสวนในฟาร์ม</strong><p>ระบบซื้อโครงการและก่อสร้างสวนกำลังเตรียมเปิด แบบที่ค้นพบจะเก็บไว้ให้</p></div><Link className={styles.primary} href="/collection/school/learn">เปิดสมุดแบบสร้าง →</Link><button className={styles.secondary} onClick={restart}>เรียนทบทวนอีกครั้ง</button></div>}
 </section>;
}
