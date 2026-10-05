"use client";
import FloorPuzzle from "./FloorPuzzle";
import styles from "./school.module.css";
export default function FloorPractice(){
 return <section className={styles.school}>
  <div className={styles.panel}><h1 className="text-xl font-bold text-gold-hi">เล่นจัดพื้นอีกครั้ง</h1><p>รอบฝึก · ไม่จับเวลา เล่นซ้ำได้ทุกครั้ง</p><p>ใช้กระเบื้องและวิธีเล่นเดียวกับตอนสร้างโรงเรียน รอบนี้ไม่เปลี่ยนความคืบหน้า ไม่เพิ่มโทษ และไม่ใช้ Qmon คุมงาน</p></div>
  <FloorPuzzle busy={false} practice onSubmit={()=>{}}/>
 </section>;
}
