"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { getPetImagePath } from "@/lib/petImage";
import type { Subline, Personality } from "@/lib/evolution";
import type { CalendarDay } from "@/lib/petCalendar";
import { expTierClass, expTierTextClass } from "@/lib/expTier";
import { DAILY_EXP_CAP } from "@/lib/exp";

const DAY_LABEL_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const MONTH_LABEL_TH = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

// จ=0 .. อา=6 ของ dateStr นี้ (เทียบ UTC date ล้วนๆ พอ เพราะ dateStr เป็น YYYY-MM-DD ปฏิทิน
// Bangkok อยู่แล้วจากฝั่ง server ไม่ต้องแปลง timezone ซ้ำ)
function mondayIndexOf(dateStr: string): number {
  const utcDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return (utcDay + 6) % 7;
}

function petImagePathFor(day: CalendarDay): string | null {
  if (!day.spritePrefix || day.stage === null) return null;
  try {
    return getPetImagePath(day.spritePrefix, day.stage, day.subline as Subline | null, day.personality as Personality | null);
  } catch {
    return null;
  }
}

function DetailCard({ day, onClose }: { day: CalendarDay; onClose: () => void }) {
  const petImagePath = petImagePathFor(day);
  const dayLabel = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dailyProgress = Math.min(1, day.expEarned / DAILY_EXP_CAP);
  const reachedCap = day.expEarned >= DAILY_EXP_CAP;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-gold-dim bg-card p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between">
          <p className="text-xs text-text3">{dayLabel}</p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="text-text3">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-xl border border-border bg-track">
          {petImagePath ? (
            <Image
              src={petImagePath}
              alt=""
              width={64}
              height={64}
              className={!day.hasData ? "opacity-40 grayscale" : ""}
            />
          ) : (
            <span className="text-xs text-text3">ไม่มี</span>
          )}
        </div>

        {day.stage !== null && (
          <p className="text-sm font-bold text-gold-hi">
            {day.formName ?? `ระยะ ${day.stage}`}
            {day.formName ? ` · ระยะ ${day.stage}` : ""}
          </p>
        )}

        {!day.hasData ? (
          <p className="text-sm text-text3">ยังไม่ได้เล่นวันนี้</p>
        ) : (
          <>
            <div className="w-full">
              <p className="mb-1 text-left text-xs text-text2">EXP +{day.expEarned}</p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-track">
                <div className="h-full bg-amber transition-all" style={{ width: `${dailyProgress * 100}%` }} />
              </div>
              {reachedCap && <p className="mt-1 text-xs text-gold-hi">ครบเป้าหมาย ✔</p>}
            </div>

            <div className="grid w-full grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-1 rounded-xl bg-track py-2">
                <span className="text-lg font-bold text-gold-hi">{day.mathCorrect}</span>
                <span className="text-[10px] text-text3">คณิต</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-xl bg-track py-2">
                <span className="text-lg font-bold text-gold-hi">{day.scienceCorrect}</span>
                <span className="text-[10px] text-text3">วิทย์</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-xl bg-track py-2">
                <span className="text-lg font-bold text-gold-hi">{day.mathCorrect + day.scienceCorrect}</span>
                <span className="text-[10px] text-text3">รวม</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PetCalendarClient({
  year,
  month,
  days,
  isCurrentMonth,
}: {
  year: number;
  month: number;
  days: CalendarDay[];
  isCurrentMonth: boolean;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const leadingBlanks = days.length > 0 ? mondayIndexOf(days[0].date) : 0;
  const selectedDay = days.find((d) => d.date === selectedDate) ?? null;

  function goToMonth(y: number, m: number) {
    let ny = y;
    let nm = m;
    if (nm < 1) {
      nm = 12;
      ny -= 1;
    } else if (nm > 12) {
      nm = 1;
      ny += 1;
    }
    router.push(`/pet/calendar?year=${ny}&month=${nm}`);
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-2xl border border-gold-dim bg-card p-3">
          <button
            type="button"
            onClick={() => goToMonth(year, month - 1)}
            aria-label="เดือนก่อนหน้า"
            className="rounded-xl p-2 text-gold-hi active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="text-sm font-bold text-gold-hi">
            {MONTH_LABEL_TH[month - 1]} {year + 543}
          </p>
          <button
            type="button"
            onClick={() => goToMonth(year, month + 1)}
            disabled={isCurrentMonth}
            aria-label="เดือนถัดไป"
            className="rounded-xl p-2 text-gold-hi disabled:opacity-30 active:scale-95"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-2xl border border-gold-dim bg-card p-2">
          <div className="mb-2 grid grid-cols-7 gap-1">
            {DAY_LABEL_TH.map((label) => (
              <span key={label} className="text-center text-xs text-text3">
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                disabled={day.isFuture}
                onClick={() => setSelectedDate(day.date)}
                className={`relative flex aspect-square items-center justify-center rounded-lg border text-sm font-medium disabled:cursor-not-allowed ${
                  day.isFuture
                    ? "border-dashed border-border text-text3 opacity-40"
                    : `border-border ${expTierTextClass(day.expEarned)}`
                } ${day.isFuture ? "" : expTierClass(day.expEarned)} ${day.isToday ? "border-2 border-gold-hi" : ""}`}
              >
                {Number(day.date.slice(-2))}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push("/pet")}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl border border-gold bg-amber text-lg font-bold text-track shadow-lg transition active:scale-95"
      >
        กลับไปหน้า Qmon
      </button>

      {selectedDay && <DetailCard day={selectedDay} onClose={() => setSelectedDate(null)} />}
    </div>
  );
}
