"use client";

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { getWeeklyLeaderboardTop5 } from "@/app/pet/actions";
import type { LeaderboardEntry, MyWeeklyRank } from "@/lib/weeklyLeaderboard";
import type { GradeBand } from "@/lib/gradeBand";
import { useSfx } from "@/lib/audio/useSfx";

// ข้อความ ม.ต้น/ม.ปลาย ต้องตรงกับ bandLabel() ใน src/app/admin/analytics/page.tsx เป๊ะๆ (คนละไฟล์
// ไม่มี export กลางให้ import ร่วมกัน — ห้ามคิด wording ใหม่ถ้าจะแก้ ให้ sync คู่กับที่นั่นด้วย)
const GRADE_BAND_LABEL_TH: Record<GradeBand, string> = {
  junior: "ม.ต้น",
  senior: "ม.ปลาย",
};

// แถบอันดับสัปดาห์ — อยู่บนสุดของหน้า /pet ใต้ชื่อน้อง (จัดใหม่ 2026-09 เดิมเป็นการ์ดพับได้ล่างสุด)
// สีเป็นก้อนของตัวเอง ใช้ค่าเดียวกันทั้งธีมค่ำ/สว่าง (.rank-strip-* ใน globals.css) แบ่ง 4 ระดับ:
//   champ = อันดับ 1 (ทองเข้ม + ประกาย) / podium = Top 5 (ทองอ่อน) / climb = นอก Top 5 (ม่วงคราม —
//   ไม่ใช้ส้มเพราะจะแย่งกับการ์ดภารกิจสีส้มชมพูที่เป็น CTA หลัก) / none = ยังไม่มีอันดับ (การ์ดเส้นประชวนเริ่ม)
// แตะแล้วเปิดแผ่น Top 5 จากด้านล่าง (แท่นรางวัล 3 อันดับแรก) — Top 5 (get_weekly_leaderboard)
// lazy-load ตอนเปิดครั้งแรกเท่านั้น (top5 = null คือยังไม่เคยโหลด)
//
// myWeeklyRank มาจาก getMyWeeklyRank() ที่ page.tsx fetch ให้แล้ว (มาพร้อม initial render)
type Tier = "champ" | "podium" | "climb";

export default function WeeklyLeaderboardCard({
  myWeeklyRank,
  gradeBand,
}: {
  myWeeklyRank: MyWeeklyRank;
  gradeBand: GradeBand | null;
}) {
  const sfx = useSfx();
  const [open, setOpen] = useState(false);
  const [top5, setTop5] = useState<LeaderboardEntry[] | null>(null);
  const [loadingTop5, setLoadingTop5] = useState(false);

  // gradeBand ("junior"/"senior") มาจาก profiles คนละความหมายกับ band ของ myWeeklyRank
  // (percentile tier "top"/"mid"/"start") — null fallback เป็น junior ให้ตรงกับ default ของ getGradeBand()
  const groupLabelTh = GRADE_BAND_LABEL_TH[gradeBand ?? "junior"];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function openSheet() {
    sfx("tap");
    setOpen(true);
    if (top5 === null && !loadingTop5) {
      setLoadingTop5(true);
      try {
        setTop5(await getWeeklyLeaderboardTop5());
      } catch (err) {
        console.error("getWeeklyLeaderboardTop5 failed:", err);
        setTop5([]);
      } finally {
        setLoadingTop5(false);
      }
    }
  }

  if (!myWeeklyRank.hasRank) {
    return (
      <div className="rank-strip-none flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-track text-xl" aria-hidden>
          🏆
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text">แข่งอันดับสัปดาห์นี้ ({groupLabelTh})</p>
          <p className="truncate text-xs text-text3">ตอบวันนี้สักข้อ เข้าร่วมแข่งได้เลย!</p>
        </div>
      </div>
    );
  }

  const { inTop5, myRank, band, points, pointsToNext, username: myUsername } = myWeeklyRank;

  let tier: Tier;
  let icon: string;
  let headline: string;
  let subline: string;
  if (inTop5 && myRank === 1) {
    tier = "champ";
    icon = "👑";
    headline = `อันดับ 1 ของ ${groupLabelTh} สัปดาห์นี้!`;
    subline = "เก่งมาก รักษาแชมป์ไว้ให้ได้นะ";
  } else if (inTop5) {
    tier = "podium";
    icon = "🏆";
    headline = `อันดับ ${myRank} ของ ${groupLabelTh} สัปดาห์นี้`;
    // points_to_next = แต้มที่ต้องได้เพิ่มเพื่อแซงคนอันดับเหนือกว่า บวก +1 มาแล้วจาก RPC (migration 021)
    // ห้าม -1 ซ้ำอีก และห้ามเรียกว่า "นำอยู่" (คนละทิศ)
    subline = `อีก ${pointsToNext ?? 0} แต้มแซงอันดับ ${myRank - 1}!`;
  } else {
    tier = "climb";
    icon = band === "top" ? "🔥" : band === "mid" ? "🌱" : "✨";
    headline = `ราวอันดับ ${myRank} ของ ${groupLabelTh} สัปดาห์นี้`;
    subline =
      band === "start"
        ? "ทุกวันที่มาช่วยไต่อันดับได้"
        : `อีก ${pointsToNext ?? 0} แต้ม${band === "top" ? "ขึ้น Top 5" : "ขยับขึ้น"}!`;
  }
  // หลอดความคืบหน้าไปเป้าถัดไป (แซงคนข้างบน / ขึ้น Top 5) — แชมป์เต็มหลอด
  const progress =
    tier === "champ" ? 1 : pointsToNext ? Math.min(1, Math.max(0.05, points / (points + pointsToNext))) : 0;

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        className={`rank-strip rank-strip-${tier} relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 text-left shadow-md transition active:scale-[0.98]`}
      >
        <span className="rank-strip-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{headline}</span>
          <span className="mt-0.5 flex items-center gap-2">
            {tier !== "champ" && (
              <span className="rank-strip-track h-1.5 w-16 shrink-0 overflow-hidden rounded-full">
                <span className="rank-strip-fill block h-full rounded-full" style={{ width: `${progress * 100}%` }} />
              </span>
            )}
            <span className="rank-strip-sub truncate text-xs">{subline}</span>
          </span>
        </span>
        <ChevronRight size={18} className="rank-strip-sub shrink-0" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-rank-title"
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-gold-dim bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id="weekly-rank-title" className="text-base font-bold text-gold-hi">
                🏆 อันดับสัปดาห์นี้ · {groupLabelTh}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="flex h-9 w-9 items-center justify-center rounded-full text-text3 active:scale-95"
              >
                <X size={18} />
              </button>
            </div>

            {loadingTop5 && top5 === null ? (
              <p className="py-10 text-center text-sm text-text3">กำลังโหลด...</p>
            ) : (
              <RankList top5={top5 ?? []} inTop5={inTop5} myRank={myRank} myUsername={myUsername} myPoints={points} />
            )}
            <p className="mt-4 text-center text-[11px] text-text3">แต้มนับจากการตอบคำถามสัปดาห์นี้ เริ่มใหม่ทุกวันจันทร์</p>
          </div>
        </div>
      )}
    </>
  );
}

// แท่นรางวัล: เรียงซ้าย-กลาง-ขวา = อันดับ 2-1-3 (อันดับ 1 สูงสุดตรงกลาง) แล้วต่อด้วยอันดับ 4-5
// และแถวของเราเองถ้าไม่อยู่ใน Top 5
const PODIUM_ORDER = [2, 1, 3];
const PODIUM_STYLE: Record<number, { medal: string; height: string; cls: string }> = {
  1: { medal: "🥇", height: "h-24", cls: "rank-podium-1" },
  2: { medal: "🥈", height: "h-16", cls: "rank-podium-2" },
  3: { medal: "🥉", height: "h-12", cls: "rank-podium-3" },
};

function RankList({
  top5,
  inTop5,
  myRank,
  myUsername,
  myPoints,
}: {
  top5: LeaderboardEntry[];
  inTop5: boolean;
  myRank: number;
  myUsername: string;
  myPoints: number;
}) {
  if (top5.length === 0) {
    return <p className="py-10 text-center text-sm text-text3">ยังไม่มีข้อมูลอันดับสัปดาห์นี้</p>;
  }
  const byRank = new Map(top5.map((r) => [r.rnk, r]));
  const rest = top5.filter((r) => r.rnk > 3);
  const isMe = (rnk: number) => inTop5 && rnk === myRank;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 items-end gap-2 pt-2">
        {PODIUM_ORDER.map((rnk) => {
          const row = byRank.get(rnk);
          const style = PODIUM_STYLE[rnk];
          return (
            <div key={rnk} className="flex min-w-0 flex-col items-center gap-1 text-center">
              {row ? (
                <>
                  <span className="text-2xl" aria-hidden>
                    {style.medal}
                  </span>
                  <span className={`block max-w-full truncate text-xs font-bold ${isMe(rnk) ? "text-gold-hi" : "text-text"}`}>
                    {row.username}
                    {isMe(rnk) && " (คุณ)"}
                  </span>
                  <span className="text-[11px] text-text3">{row.total_points} แต้ม</span>
                </>
              ) : (
                <span className="text-xs text-text3">—</span>
              )}
              <div className={`${style.height} ${style.cls} flex w-full items-start justify-center rounded-t-xl pt-1 text-lg font-bold`}>
                {rnk}
              </div>
            </div>
          );
        })}
      </div>

      {(rest.length > 0 || !inTop5) && (
        <ul className="flex flex-col gap-1.5">
          {rest.map((row) => (
            <li
              key={`${row.rnk}-${row.username}`}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                isMe(row.rnk) ? "bg-gold-dim/40 font-bold text-gold-hi" : "bg-track text-text2"
              }`}
            >
              <span className="w-5 shrink-0 text-center font-bold">{row.rnk}</span>
              <span className="min-w-0 flex-1 truncate">
                {row.username}
                {isMe(row.rnk) && <span className="ml-1 text-[11px] font-normal text-text3">(คุณ)</span>}
              </span>
              <span className="shrink-0 font-bold">{row.total_points}</span>
            </li>
          ))}
          {!inTop5 && (
            <li className="flex items-center gap-3 rounded-xl border border-amber/60 bg-amber/10 px-3 py-2 text-sm text-text">
              <span className="w-5 shrink-0 text-center font-bold text-amber">~{myRank}</span>
              <span className="min-w-0 flex-1 truncate">
                {myUsername}
                <span className="ml-1 text-[11px] text-text3">(คุณ)</span>
              </span>
              <span className="shrink-0 font-bold text-amber">{myPoints}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
