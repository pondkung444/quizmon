import Image from "next/image";
import { Repeat } from "lucide-react";
import { getPetImagePath } from "@/lib/petImage";
import type { Subline, Personality } from "@/lib/evolution";
import type { JourneyDay } from "@/lib/weeklyJourney";

// index 0-6 ของ days array = จ-อา ตรงตัวเสมอ (ลำดับที่ getWeeklyJourney คืนมา) ไม่ต้องคำนวณ
// วันในสัปดาห์ใหม่จาก JourneyDay.date
const DAY_LABEL_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

// 5 ระดับตาม expEarned ของวันนั้น: 0 / 1-59 / 60-119 / 120-179 / 180 (เต็มเพดาน)
function tierClass(expEarned: number): string {
  if (expEarned <= 0) return "bg-track";
  if (expEarned < 60) return "bg-border";
  if (expEarned < 120) return "bg-amber-dim/60";
  if (expEarned < 180) return "bg-amber/70";
  return "bg-amber shadow-[0_0_10px_2px_var(--color-amber)]";
}

function DayCell({ day }: { day: JourneyDay }) {
  if (day.isFuture) {
    return <div className="h-11 w-11 rounded-xl border border-dashed border-border" />;
  }

  let petImagePath: string | null = null;
  if (day.spritePrefix && day.stage) {
    try {
      petImagePath = getPetImagePath(
        day.spritePrefix,
        day.stage,
        day.subline as Subline | null,
        day.personality as Personality | null
      );
    } catch {
      // stage 4 ระหว่างรอเลือกบุคลิก (personality ยัง null ชั่วคราว) — ไม่มีรูปให้แสดง ไม่ถือเป็น error
      petImagePath = null;
    }
  }

  return (
    <div
      className={`relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border ${
        day.isToday ? "border-2 border-gold-hi" : "border-border"
      } ${tierClass(day.expEarned)}`}
    >
      {day.didEvolveThisDay && <span className="absolute right-0.5 top-0.5 text-[10px] leading-none text-gold-hi">✦</span>}
      {day.didCollectThisDay && (
        <Repeat className="absolute left-0.5 top-0.5 h-2.5 w-2.5 text-gold-hi" strokeWidth={2.5} />
      )}

      {petImagePath ? (
        <Image
          src={petImagePath}
          alt=""
          width={28}
          height={28}
          className={day.expEarned === 0 ? "opacity-40 grayscale" : ""}
        />
      ) : null}
    </div>
  );
}

export default function WeeklyJourneyCard({ days }: { days: JourneyDay[] }) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-gold-dim bg-card p-4">
      <div className="flex items-start justify-between gap-1">
        {days.map((day, i) => (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <span className={`text-[10px] ${day.isToday ? "font-bold text-gold-hi" : "text-text3"}`}>
              {DAY_LABEL_TH[i]}
            </span>
            <DayCell day={day} />
          </div>
        ))}
      </div>
    </div>
  );
}
