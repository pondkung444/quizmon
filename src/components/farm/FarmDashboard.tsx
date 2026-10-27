import Link from 'next/link';
import Image from 'next/image';
import type { SchoolProject } from '@/lib/farm/school';
import type { GardenProject } from '@/lib/farm/garden';
import { farmNextStep } from '@/lib/farm/dashboard';
export default function FarmDashboard({ school, gardens, balance, level, placing, now, canStartSchool = true, children }: {
    school: SchoolProject | null;
    gardens: GardenProject[];
    balance: number;
    level: number;
    placing: boolean;
    now: number; canStartSchool?: boolean;
    children: React.ReactNode;
}) {
    const next = farmNextStep(school, gardens, now, canStartSchool);
    return <div className="farm-dashboard"><header className="farm-dashboard-heading"><div><p>บ้านของคู่หู ค่อย ๆ เติบโตไปด้วยกัน</p><h1>ฟาร์มของเรา</h1></div><span className="farm-wallet">เหรียญฟาร์ม <b>{balance.toLocaleString('th-TH')}</b></span></header><div className="farm-dashboard-grid"><div className="farm-mission"><span className="farm-eyebrow">ก้าวถัดไปของเรา · โรงเรียนระดับ {level}</span><Image src="/pets/egg1_stage2_baby.png" width={112} height={112} alt="คู่หู Qmon" className="farm-mission-pet"/><h2>{placing ? 'เลือกบ้านให้โรงเรียน' : next.title}</h2><p>{placing ? 'เลื่อนแผนที่ แล้วแตะช่องว่างที่เชื่อมกับฟาร์มเพื่อวางโรงเรียน' : next.detail}</p>{!placing && <Link className="farm-primary" href={next.href}>{next.label} →</Link>}<small>{!school || school.status === "draft" ? "โรงเรียนหลังแรกสร้างฟรี · เลือกคู่หูแล้วเริ่มได้เลย" : "ความคืบหน้าเดิมยังอยู่ กลับมาทำต่อได้เสมอ"}</small></div><div className="farm-map-panel">{children}</div></div><section className="farm-shortcuts" aria-label="สำรวจฟาร์ม"><Link href="/collection/school"><b>โรงเรียน</b><span>สถานะงานและคู่หูคุมงาน →</span></Link><Link href="/collection/school/learn"><b>สมุดแบบสร้าง</b><span>เรียนรู้และค้นพบพื้นที่ใหม่ →</span></Link><Link href="/collection/encouragement"><b>เยี่ยมเพื่อน</b><span>ส่งกำลังใจให้ฟาร์มเพื่อน →</span></Link></section></div>;
}
