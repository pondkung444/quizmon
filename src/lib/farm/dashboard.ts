import type { SchoolProject } from './school.ts';
import type { GardenProject } from './garden.ts';
import { schoolDisplayState } from './school.ts';
export function farmNextStep(school: SchoolProject | null, gardens: GardenProject[], now: number, canStartSchool = true) {
    if ((!school || school.status === "draft") && !canStartSchool) return {title:"ฟักคู่หูตัวแรก",detail:"ฟักไข่และเลี้ยงคู่หูให้พร้อม แล้วกลับมาสร้างโรงเรียนด้วยกัน",label:"ไปฟักไข่",href:"/eggs"};
    const s = school ? schoolDisplayState(school, now) : null;
    if (!s || s.status === 'draft')
        return { title: 'สร้างโรงเรียนหลังแรก', detail: 'เลือกคู่หูคุมงาน แล้วช่วยกันปูพื้นโรงเรียน', label: 'เริ่มสร้างโรงเรียน', href: '/collection/school' };
    if (s.status === 'ready')
        return { title: 'โรงเรียนพร้อมแล้ว!', detail: 'เลือกพื้นที่ให้โรงเรียน คู่หูจะมีที่เรียนรู้ด้วยกัน', label: 'เลือกที่วางโรงเรียน', href: '/collection?place=school' };
    if (s.status !== 'placed')
        return { title: s.status === 'puzzle' ? 'คู่หูรอให้ช่วยปูพื้น' : s.status === 'paused' ? 'กลับมาสร้างโรงเรียนต่อ' : 'คู่หูกำลังสร้างโรงเรียน', detail: s.status === 'puzzle' ? 'แก้ผังเดิมต่อได้ ความคืบหน้าที่ทำไว้ยังอยู่' : 'เปิดดูเวลา ทีม และความคืบหน้าที่บันทึกไว้', label: 'ดูงานโรงเรียน', href: '/collection/school' };
    const garden = gardens.find(g => g.status !== 'placed');
    if (garden)
        return { title: 'มาช่วยกันสร้างสวน', detail: 'ดูงานสวนที่ทำค้างไว้ แล้วพาคู่หูเดินไปถึงม้านั่ง', label: 'ดูงานสวน', href: '/collection/garden?project=' + garden.id };
    if (!gardens.some(g => g.status === 'placed'))
        return { title: 'เพิ่มสวนพักผ่อนให้คู่หู', detail: 'ค้นพบแบบสวน แล้วเลือกทีมสร้างพื้นที่เดินเล่นแห่งใหม่', label: 'ดูแบบสร้างสวน', href: '/collection/school/learn' };
    return { title: 'ขยายฟาร์มไปด้วยกัน', detail: 'เลือกงานถัดไป ดูสิ่งที่ต้องเตรียม และจัดทีมก่อนเริ่มสร้าง', label: 'ดูงานก่อสร้าง', href: '/collection/projects' };
}
