"use client";

import { useState, useTransition } from "react";
import { Crown } from "lucide-react";
import { loadMoreHallOfFame } from "@/app/hall-of-fame/actions";
import type { HallOfFameWeek, HallOfFameWinner } from "@/lib/hallOfFame";

function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate + "T00:00:00+07:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" });
  return `${fmt.format(start)} - ${fmt.format(end)}`;
}

// ไม่มีระบบ avatar/รูปโปรไฟล์ผู้ใช้ในระบบนี้เลย (สำรวจแล้ว) — ใช้ไอคอนมงกุฎกลางๆ แทนเสมอ ไม่ใช้
// รูปสัตว์เลี้ยงปัจจุบันของผู้เล่น เพราะ pet ที่ active วันนี้อาจไม่ใช่ตัวที่เล่นตอนชนะสัปดาห์นั้นจริง
function WinnerRow({ winner }: { winner: HallOfFameWinner }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gold-dim bg-track px-3 py-2">
      <Crown className="h-5 w-5 shrink-0 text-amber" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-text">{winner.username}</p>
        <p className="text-xs text-text3">{winner.totalPoints} คะแนน</p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          winner.claimed ? "bg-amber/20 text-amber" : "border border-border text-text3"
        }`}
      >
        {winner.claimed ? "ได้ไข่ทิพย์แล้ว" : "ยังไม่เคลม"}
      </span>
    </div>
  );
}

// เสมออันดับ 1 หลายคน → โชว์ทุกคนเท่ากันในช่องเดียว ไม่มี tie-breaker/จัดลำดับซ้อน
function BandColumn({ label, winners }: { label: string; winners: HallOfFameWinner[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold text-text2">{label}</p>
      {winners.length === 0 ? (
        <p className="text-xs text-text3">ไม่มีผู้เล่น</p>
      ) : (
        winners.map((w) => <WinnerRow key={w.userId} winner={w} />)
      )}
    </div>
  );
}

// ไม่ใช่ leaderboard เต็ม — ห้ามโชว์อันดับอื่นนอกจากที่ 1 (พื้นที่ฉลองเท่านั้น ตามหลัก positive-only เดิม)
export default function HallOfFameList({
  initialWeeks,
  initialHasMore,
}: {
  initialWeeks: HallOfFameWeek[];
  initialHasMore: boolean;
}) {
  const [weeks, setWeeks] = useState(initialWeeks);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    <div className="flex flex-col gap-4">
      {weeks.map((week) => (
        <section
          key={week.weekStartDate}
          className="flex flex-col gap-3 rounded-2xl border border-gold-dim bg-card p-4"
        >
          <h2 className="text-sm font-bold text-gold-hi">สัปดาห์ {formatWeekLabel(week.weekStartDate)}</h2>
          <div className="grid grid-cols-2 gap-3">
            <BandColumn label="ม.ต้น" winners={week.junior} />
            <BandColumn label="ม.ปลาย" winners={week.senior} />
          </div>
        </section>
      ))}

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
  );
}
