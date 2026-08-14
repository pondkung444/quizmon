"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Crown } from "lucide-react";
import { loadMoreHallOfFame } from "@/app/hall-of-fame/actions";
import type { CurrentWeekLeader, CurrentWeekLeaders, HallOfFameWeek, HallOfFameWinner } from "@/lib/hallOfFame";

function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate + "T00:00:00+07:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" });
  return `${fmt.format(start)} - ${fmt.format(end)}`;
}

// weekEnd มาจาก get_current_week_leaders() (current_week_bounds_bkk ภายใน RPC) เสมอ — ห้ามคำนวณ
// ขอบสัปดาห์เอง ฟังก์ชันนี้แค่ diff เวลาปัจจุบันของเครื่องผู้เล่นกับ deadline ที่ RPC บอกมา
function formatRemaining(weekEndIso: string): string {
  const diffMs = new Date(weekEndIso).getTime() - Date.now();
  if (diffMs <= 0) return "กำลังจะปิดสัปดาห์";
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days <= 1 ? "เหลือไม่ถึง 1 วัน" : `เหลืออีก ${days} วัน`;
}

// แถวเดียวใช้ร่วมกันทั้งสัปดาห์ที่จบแล้วและสัปดาห์ที่กำลังแข่ง — ต่างกันแค่สีมงกุฎ (crownDimmed
// บอกว่ายังไม่ตัดสิน) ขอบด้านเดียว (border-l) ตั้งใจไม่ใส่ rounded corner คู่กับมันเพราะขอบด้านเดียว
// โค้งมนแล้วดูเพี้ยน — ไม่มี placeholder เทาๆ ตอนไม่มีรูป pet (ดู getPetImagePath/hallOfFame.ts —
// resolvePet คืน null เงียบๆ ถ้าไม่เคยมี pet stage 4)
function WinnerRow({
  winner,
  bandLabel,
  isCurrentUser,
  crownDimmed,
}: {
  winner: HallOfFameWinner | CurrentWeekLeader;
  bandLabel: string;
  isCurrentUser: boolean;
  crownDimmed?: boolean;
}) {
  const pet = winner.pet;
  return (
    <div
      className={`flex items-center gap-3 border-l-2 px-3 py-2.5 ${
        isCurrentUser ? "border-l-gold bg-gold-dim/15" : "border-l-gold-dim bg-track"
      }`}
    >
      <Link href={`/social/profile/${winner.userId}`} className="flex min-w-0 flex-1 items-center gap-3">
        {pet && (
          <Image
            src={pet.imagePath}
            alt={pet.speciesName}
            width={64}
            height={64}
            className="h-14 w-14 shrink-0 rounded-full object-contain sm:h-16 sm:w-16"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-text3">{bandLabel}</p>
          <p className="truncate text-lg font-bold text-text sm:text-xl">{winner.username}</p>
          <p className="truncate text-[11px] text-text3 sm:text-xs">
            {winner.totalPoints} คะแนน{pet ? ` · ${pet.speciesName}` : ""}
          </p>
        </div>
      </Link>
      <div className="ml-auto flex shrink-0 flex-col items-center gap-1">
        <Crown size={20} className={crownDimmed ? "text-gold-dim" : "text-amber"} />
        {isCurrentUser && (
          <span className="whitespace-nowrap rounded-full bg-gold-dim/30 px-1.5 py-0.5 text-[9px] font-medium text-gold-hi">
            นี่คือคุณ
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyBandLine({ label }: { label: string }) {
  return <p className="px-3 text-xs text-text3">{label}: ยังไม่มีใครทำคะแนนสัปดาห์นี้</p>;
}

function WeekDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs font-bold text-gold-hi">สัปดาห์ {label}</span>
      <div className="flex-1 border-t border-border" style={{ borderTopWidth: "0.5px" }} />
    </div>
  );
}

// เสมออันดับ 1 หลายคน → โชว์ทุกคนเท่ากันในแถวแยกกัน ไม่มี tie-breaker/จัดลำดับซ้อน
export default function HallOfFameList({
  currentUserId,
  currentWeek,
  initialWeeks,
  initialHasMore,
}: {
  currentUserId: string;
  currentWeek: CurrentWeekLeaders;
  initialWeeks: HallOfFameWeek[];
  initialHasMore: boolean;
}) {
  const [weeks, setWeeks] = useState(initialWeeks);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // "ยังไม่มีชื่อในทำเนียบ" อิงจากสัปดาห์ที่โหลดมาแล้ว ณ ตอนนี้ (initial 5 สัปดาห์ล่าสุด + ที่กด
  // โหลดเพิ่ม) ไม่ใช่ประวัติทั้งหมดตลอดกาล — เพียงพอในทางปฏิบัติเพราะสัปดาห์ตัดที่ 2026-07-27
  // ยังมีจำนวนน้อยมาก (โตสัปดาห์ละ 1 แถวเท่านั้น ดู handoff หมวด 1 ข้อ 5)
  const everAppeared = useMemo(() => {
    const inCurrent = [...currentWeek.junior, ...currentWeek.senior].some((w) => w.userId === currentUserId);
    if (inCurrent) return true;
    return weeks.some((week) => [...week.junior, ...week.senior].some((w) => w.userId === currentUserId));
  }, [weeks, currentWeek, currentUserId]);

  function handleLoadMore() {
    setError(null);
    startTransition(async () => {
      try {
        // ส่งจำนวนสัปดาห์ที่โชว์อยู่แล้วเป็น offset เสมอ (นับเฉพาะสัปดาห์ที่มีคนเล่นจริง ตรงกับที่
        // get_hall_of_fame_page คาดหวัง — ดู getHallOfFamePage ใน src/lib/hallOfFame.ts)
        const next = await loadMoreHallOfFame(weeks.length);
        setWeeks((prev) => [...prev, ...next.weeks]);
        setHasMore(next.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : "โหลดเพิ่มไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <WeekDivider label="สัปดาห์นี้ · กำลังแข่ง" />
        {currentWeek.weekEnd && <p className="px-3 text-xs text-text3">{formatRemaining(currentWeek.weekEnd)}</p>}
        <div className="flex flex-col gap-2">
          {currentWeek.junior.length === 0 ? (
            <EmptyBandLine label="ม.ต้น" />
          ) : (
            currentWeek.junior.map((w) => (
              <WinnerRow key={w.userId} winner={w} bandLabel="ม.ต้น" isCurrentUser={w.userId === currentUserId} crownDimmed />
            ))
          )}
          {currentWeek.senior.length === 0 ? (
            <EmptyBandLine label="ม.ปลาย" />
          ) : (
            currentWeek.senior.map((w) => (
              <WinnerRow key={w.userId} winner={w} bandLabel="ม.ปลาย" isCurrentUser={w.userId === currentUserId} crownDimmed />
            ))
          )}
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {weeks.length === 0 && !hasMore ? (
          <p className="text-center text-sm text-text3">ยังไม่มีสัปดาห์ที่จบแล้ว — กลับมาดูใหม่หลังสัปดาห์นี้จบ</p>
        ) : (
          weeks.map((week) => (
            <section key={week.weekStartDate} className="flex flex-col gap-2">
              <WeekDivider label={formatWeekLabel(week.weekStartDate)} />
              <div className="flex flex-col gap-2">
                {week.junior.map((w) => (
                  <WinnerRow key={w.userId} winner={w} bandLabel="ม.ต้น" isCurrentUser={w.userId === currentUserId} />
                ))}
                {week.senior.map((w) => (
                  <WinnerRow key={w.userId} winner={w} bandLabel="ม.ปลาย" isCurrentUser={w.userId === currentUserId} />
                ))}
              </div>
            </section>
          ))
        )}

        {error && <p className="text-center text-sm text-red">{error}</p>}

        {hasMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isPending}
            className="w-full rounded-2xl border border-gold-dim bg-track py-3 text-sm font-medium text-text2 transition active:scale-95 disabled:opacity-50"
          >
            {isPending ? "กำลังโหลด..." : "โหลดเพิ่ม"}
          </button>
        )}
      </div>

      {!everAppeared && (
        <p className="text-center text-xs text-text3">ยังไม่มีชื่อในทำเนียบ — สัปดาห์นี้ยังทันนะ</p>
      )}
    </div>
  );
}
