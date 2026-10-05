import Link from "next/link";
import Image from "next/image";
import {getUser} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {loadSchoolProject,loadSchoolPets} from "@/lib/farm/school-server";
import {loadBlueprintDiscoveries} from "@/lib/farm/blueprints-server";
import {GARDEN_BLUEPRINT} from "@/lib/farm/blueprints";
import styles from "@/components/farm/learning.module.css";
export default async function BlueprintLibraryPage(){
 if(!await getUser())redirect("/login");
 const [school,pets,discoveries]=await Promise.all([loadSchoolProject(),loadSchoolPets(),loadBlueprintDiscoveries()]);
 const placed=school?.status==="placed",found=discoveries.find(d=>d.blueprint_id===GARDEN_BLUEPRINT.id);
 return <main data-app-wide className={styles.library}>
  <Link href="/collection/school" className={styles.back}>← กลับโรงเรียน</Link>
  <header className={styles.libraryHeader}><span>📖 สมุดแบบสร้าง</span><h1>เรียนวันนี้ ฟาร์มโตวันหน้า</h1><p>เรียนกับคู่หูเพื่อค้นพบแบบสถานที่ใหม่ เก็บไว้ในสมุดของเรา</p></header>
  <div className={styles.bookCount}>ค้นพบแล้ว {found?1:0} / 1 แบบที่เปิดให้เรียน</div>
  {!placed&&<aside className={styles.notice}><strong>วางโรงเรียนก่อน แล้วเริ่มเรียนได้เลย</strong><p>ดูแบบและเงื่อนไขล่วงหน้าได้ตอนนี้</p><Link href={school?.status==="ready"?"/collection?place=school":"/collection/school"}>ไปทำโรงเรียนให้พร้อม →</Link></aside>}
  <article className={styles.blueprintCard}>
   <div className={styles.art}><Image src={GARDEN_BLUEPRINT.image} width={480} height={440} alt="แบบสวนพักผ่อน มีศาลาหลังคาเขียว ร่มไม้ ทางหิน และแปลงดอกไม้" priority/><span>{found?"✓ ค้นพบแล้ว":"แบบแรกของเรา"}</span></div>
   <div className={styles.cardContent}><h2>{GARDEN_BLUEPRINT.name}</h2><p>{GARDEN_BLUEPRINT.description}</p>
    <ul className={styles.requirements}><li>{placed?"✓":"○"} วางโรงเรียนระดับ 1 ในฟาร์ม</li><li>{pets.length?"✓":"○"} มี Qmon ที่ฟักเป็นตัว ระยะ 2–4</li><li>{found?"✓":"○"} ต่อทางเดินให้ Qmon เดินไปนั่งม้านั่งได้</li></ul>
    {found&&<p className={styles.saved}>บันทึกในสมุดแล้ว · เรียนทบทวนได้เสมอ</p>}
    <Link className={styles.primary} href="/collection/school/learn/garden">{found?"ดูแบบและเรียนทบทวน →":placed&&pets.length?"เลือก Qmon มาเรียน →":"ดูบทเรียนและสิ่งที่ต้องทำก่อน →"}</Link>
    <Link className={styles.back} href="/collection/school/learn/garden/practice">ลองต่อทาง · รอบฝึก ไม่รับแบบ →</Link><p className={styles.nextStep}>ขั้นถัดไป: ซื้อโครงการและสร้างสวนในฟาร์ม · กำลังเตรียมเปิด</p><Link className={styles.back} href="/collection/garden-plan">ดูตัวอย่างการวางสวน →</Link>
   </div>
  </article>
  <h2 className={styles.upcomingTitle}>แบบที่จะตามมา</h2><div className={styles.upcoming}><strong>💧 บ่อน้ำ Qmon</strong><p>รายละเอียดบทเรียนและเงื่อนไขกำลังออกแบบ</p></div><div className={styles.upcoming}><strong>🏫 โรงเรียนระดับ 2</strong><p>การอัปเกรดและเงื่อนไขปลดล็อกจะมาในเฟสถัดไป</p></div>
 </main>;
}
