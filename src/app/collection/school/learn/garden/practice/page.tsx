import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getUser} from '@/lib/supabase/server';
import {loadSchoolPets} from '@/lib/farm/school-server';
import GardenPathPuzzle from '@/components/farm/GardenPathPuzzle';
import styles from '@/components/farm/learning.module.css';
export default async function GardenPracticePage(){
 if(!await getUser())redirect('/login');
 const pets=await loadSchoolPets();
 const pet=pets[0]??{id:'practice',name:'Qmon ตัวอย่าง',stage:2,busy:false,imagePath:'/pets/egg2_stage2_baby.png'};
 return <section className={styles.lessonScreen}><header className={styles.lessonHeader}><Link href="/collection/school/learn">← สมุดแบบ</Link><h1>สวน · รอบฝึก</h1><span>ไม่รับแบบ</span></header><GardenPathPuzzle practice pet={pet}/></section>;
}
