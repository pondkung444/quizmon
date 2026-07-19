import type { JourneyDay } from "@/lib/weeklyJourney";
import { expTierClass } from "@/lib/expTier";

// index 0-6 ของ days array = จ-อา ตรงตัวเสมอ (ลำดับที่ getWeeklyJourney คืนมา) ไม่ต้องคำนวณ
// วันในสัปดาห์ใหม่จาก JourneyDay.date
const DAY_LABEL_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

// v2 (ux pass 2026-07): ตัดรูปสัตว์ + ไอคอน evolve/collect ออกจากแถบนี้ทั้งหมด เหลือแค่สี tier —
// รายละเอียดเต็ม (รูปสัตว์รายวัน, ดาว evolve, ไอคอนสลับตัว) ยังดูได้ครบที่ /pet/calendar
// (กดแถบนี้เข้าไปได้อยู่แล้วผ่าน onClick) แถบนี้เปลี่ยนบทบาทจาก "การ์ดรายละเอียด" เป็น
// "แถบสรุปกวาดตาเดียว" แทน จุดประสงค์คือให้ไม่แย่งความสำคัญจากตัว Qmon/CTA ที่ fold แรก
function DayCell({ day }: { day: JourneyDay }) {
  if (day.isFuture) {
    return <div className="h-7 w-7 rounded-lg border border-dashed border-border" />;
  }

  return (
    <div
      className={`h-7 w-7 rounded-lg border ${
        day.isToday ? "border-2 border-gold-hi" : "border-border"
      } ${expTierClass(day.expEarned)}`}
    />
  );
}

export default function WeeklyJourneyCard({ days, onClick }: { days: JourneyDay[]; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start justify-between gap-1 rounded-xl border border-gold-dim bg-card px-3 py-2 text-left"
    >
      {days.map((day, i) => (
        <div key={day.date} className="flex flex-col items-center gap-1">
          <span className={`text-[9px] ${day.isToday ? "font-bold text-gold-hi" : "text-text3"}`}>
            {DAY_LABEL_TH[i]}
          </span>
          <DayCell day={day} />
        </div>
      ))}
    </button>
  );
}
