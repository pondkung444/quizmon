import type { ReactNode } from "react";
import { BAND_LABELS, type AnalyticsDashboardData } from "@/lib/adminAnalytics";
import StatTile from "./StatTile";
import QuestionsPerDayChart from "./QuestionsPerDayChart";
import AnalyticsLessonsCard from "./AnalyticsLessonsCard";

const number = (value: number) => value.toLocaleString("th-TH");
const percent = (value: number | null) => value == null ? "—" : `${value.toFixed(0)}%`;

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-gold-dim bg-card p-5">
    <h2 className="text-sm font-bold text-gold-hi">{title}</h2>
    <p className="mt-1 text-xs text-text3">{subtitle}</p>
    <div className="mt-4">{children}</div>
  </section>;
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsDashboardData }) {
  return <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatTile label="นักเรียนที่ฝึกวันนี้" value={number(data.today.students)} sublabel={`${number(data.today.attempts)} คำตอบ · วันนี้ตามเวลาไทย`} />
      <StatTile label="นักเรียนที่ฝึก (7 วัน)" value={number(data.summary.students)} sublabel={`จาก ${number(data.registered)} บัญชีในกลุ่มที่เลือก`} />
      <StatTile label="คำตอบทั้งหมด (7 วัน)" value={number(data.summary.attempts)} sublabel="รวมทุกโหมดที่บันทึกคำตอบ" />
      <StatTile label="อัตราตอบถูก (7 วัน)" value={percent(data.summary.accuracyPct)} sublabel={`คิดจาก ${number(data.summary.attempts)} คำตอบ ไม่ใช่ค่าเฉลี่ยคะแนนรายคน`} />
      <StatTile label="ฝึกอย่างน้อย 2 วัน (7 วัน)" value={percent(data.repeatPct)} sublabel={`${number(data.repeatStudents)} / ${number(data.summary.students)} คนที่ฝึก`} />
      <StatTile label="คำตอบเฉลี่ยต่อคน (7 วัน)" value={data.averageQuestions == null ? "—" : data.averageQuestions.toFixed(1)} sublabel="เฉพาะนักเรียนที่ตอบอย่างน้อย 1 ข้อ" />
    </div>

    {data.summary.attempts === 0 && <p className="rounded-xl border border-border bg-card p-4 text-sm text-text3">
      กลุ่มที่เลือกยังไม่มีคำตอบใน 7 วันล่าสุด ค่า — หมายถึงยังไม่มีข้อมูลให้คำนวณ
    </p>}

    <Card title="การฝึกแยกช่วงชั้น" subtitle="7 วันรวมวันนี้ · ช่วงชั้นปัจจุบันในโปรไฟล์ · นักเรียนแต่ละคนถูกนับครั้งเดียวในช่วงชั้นของตัวเอง">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b border-border text-xs text-text3">
          <th scope="col" className="pb-3 pr-4">ช่วงชั้น</th><th scope="col" className="pb-3 pr-4 text-right">บัญชี</th>
          <th scope="col" className="pb-3 pr-4 text-right">คนที่ฝึก</th><th scope="col" className="pb-3 pr-4 text-right">คำตอบ</th>
          <th scope="col" className="pb-3 text-right">อัตราตอบถูก</th>
        </tr></thead>
        <tbody>{data.bands.filter((row) => row.band !== "unknown" || row.registered > 0).map((row) => <tr key={row.band} className="border-b border-border/50">
          <th scope="row" className="py-3 pr-4 font-medium text-text">{BAND_LABELS[row.band]}</th>
          <td className="py-3 pr-4 text-right text-text3">{number(row.registered)}</td>
          <td className="py-3 pr-4 text-right text-text2">{number(row.students)}</td>
          <td className="py-3 pr-4 text-right text-text2">{number(row.attempts)}</td>
          <td className="py-3 text-right text-text2">{percent(row.accuracyPct)}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>

    <Card title="คำตอบต่อวัน" subtitle="14 วันรวมวันนี้ · วันนี้ยังไม่ครบวัน · สลับดูคำตอบรวมกับค่าเฉลี่ยต่อคนได้">
      <QuestionsPerDayChart data={data.questionsPerDay} />
    </Card>

    <Card title="นักเรียนฝึกผ่านโหมดไหน" subtitle="7 วันรวมวันนี้ · คนเดียวอาจเล่นหลายโหมด จึงบวกจำนวนคนข้ามโหมดไม่ได้">
      {data.modes.length === 0 ? <p className="py-4 text-sm text-text3">ยังไม่มีคำตอบในช่วงนี้</p> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border text-xs text-text3">
            <th scope="col" className="pb-3 pr-4">โหมด</th><th scope="col" className="pb-3 pr-4 text-right">คนที่ฝึก</th>
            <th scope="col" className="pb-3 pr-4 text-right">คำตอบ</th><th scope="col" className="pb-3 text-right">อัตราตอบถูก</th>
          </tr></thead><tbody>{data.modes.map((row) => <tr key={row.key} className="border-b border-border/50">
            <th scope="row" className="py-3 pr-4 font-medium text-text">{row.label}</th>
            <td className="py-3 pr-4 text-right text-text2">{number(row.students)}</td>
            <td className="py-3 pr-4 text-right text-text2">{number(row.attempts)}</td>
            <td className="py-3 text-right text-text2">{percent(row.accuracyPct)}</td>
          </tr>)}</tbody>
        </table></div>}
    </Card>

    <AnalyticsLessonsCard lessons={data.lessons} />
    {data.unmappedAttempts > 0 && <p className="text-xs text-text3">
      มี {number(data.unmappedAttempts)} คำตอบใน 14 วันที่ไม่พบข้อมูลบทเรียน นับในภาพรวมและกราฟแล้ว แต่ไม่รวมในตารางบทเรียน
    </p>}
    <p className="text-xs leading-relaxed text-text3">
      นับเฉพาะคำตอบที่ระบบบันทึกสำเร็จ ไม่รวมบัญชีแอดมินและบัญชีทดสอบที่ระบุไว้ · อัตราตอบถูกอาจรวมการตอบข้อเดิมซ้ำ
      และไม่ได้เป็นคะแนนสอบ · ไม่ใช้เวลาตอบเพียงอย่างเดียวสรุปว่านักเรียนเข้าใจหรือเดาคำตอบ
    </p>
  </>;
}
