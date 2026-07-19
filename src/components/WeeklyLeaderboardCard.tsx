"use client";

import { useState } from "react";
import { Trophy, Crown, ChevronDown, Flame } from "lucide-react";
import { getWeeklyLeaderboardTop5 } from "@/app/pet/actions";
import type { LeaderboardEntry, MyWeeklyRank } from "@/lib/weeklyLeaderboard";

// collapsed-by-default บรรทัดเดียว แตะขยายเป็น Top 5 in-place — ไม่ใช่การ์ดใหญ่ถาวร เพื่อไม่เพิ่ม
// ความสูงหน้า /pet ตอนปิด ดู game-design-document-v6.md หมวด Weekly Journey สำหรับ pattern เดิมที่
// การ์ดนี้อยู่ใกล้กัน (WeeklyJourneyCard.tsx)
//
// myWeeklyRank มาจาก getMyWeeklyRank() ที่ page.tsx fetch ให้แล้ว (เบา, มาพร้อม initial render ไม่ต้อง
// รอ client fetch) ส่วน Top 5 เต็ม (get_weekly_leaderboard) lazy-load เฉพาะตอนกดขยายครั้งแรกเท่านั้น
// (state top5 เก็บว่าเคยโหลดหรือยัง — null = ยังไม่เคยโหลด ไม่ fetch ซ้ำทุกครั้งที่ toggle)
export default function WeeklyLeaderboardCard({ myWeeklyRank }: { myWeeklyRank: MyWeeklyRank }) {
  const [expanded, setExpanded] = useState(false);
  const [top5, setTop5] = useState<LeaderboardEntry[] | null>(null);
  const [loadingTop5, setLoadingTop5] = useState(false);

  if (!myWeeklyRank.hasRank) {
    return (
      <div className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <Trophy size={18} className="shrink-0 text-text3" />
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-bold text-text2">ยังไม่มีอันดับสัปดาห์นี้</p>
          <p className="truncate text-[11px] text-text3">ตอบวันนี้เพื่อเข้าร่วมสัปดาห์นี้!</p>
        </div>
      </div>
    );
  }

  const { inTop5, myRank, band, points, pointsToNext } = myWeeklyRank;

  async function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && top5 === null && !loadingTop5) {
      setLoadingTop5(true);
      try {
        const rows = await getWeeklyLeaderboardTop5();
        setTop5(rows);
      } catch (err) {
        console.error("getWeeklyLeaderboardTop5 failed:", err);
        setTop5([]);
      } finally {
        setLoadingTop5(false);
      }
    }
  }

  let headline: string;
  let subline: string;
  let icon = <Trophy size={18} className="shrink-0 text-gold" />;

  if (inTop5) {
    headline = `อันดับสัปดาห์นี้ · อันดับ ${myRank}`;
    if (myRank === 1) {
      icon = <Crown size={18} className="shrink-0 text-gold-hi" />;
      subline = "🏆 อันดับ 1 ของสัปดาห์!";
    } else {
      // points_to_next = แต้มที่ต้องได้เพิ่มเพื่อแซงคนอันดับเหนือกว่า (rnk < me.rnk) บวก +1 มาแล้วจาก
      // RPC (ดู migration 021: next_points - me.total_points + 1) ไม่ใช่ระยะที่นำหน้าคนอันดับรองลงมา —
      // ห้าม -1 ซ้ำอีก และห้ามเรียกว่า "นำอยู่" (คนละทิศ)
      subline = `อีก ${pointsToNext ?? 0} แต้มแซงอันดับ ${myRank - 1}`;
    }
  } else if (band === "top") {
    icon = <Flame size={18} className="shrink-0 text-amber" />;
    headline = `อันดับสัปดาห์นี้ · ราวอันดับ ${myRank}`;
    subline = `🔥 กลุ่มหัวตาราง · อีก ${pointsToNext ?? 0} แต้มขึ้น Top 5`;
  } else if (band === "mid") {
    headline = `อันดับสัปดาห์นี้ · ราวอันดับ ${myRank}`;
    subline = `🌱 กลางตาราง · อีก ${pointsToNext ?? 0} แต้มขยับขึ้น`;
  } else {
    headline = `อันดับสัปดาห์นี้ · ราวอันดับ ${myRank}`;
    subline = "✨ กำลังเริ่ม · ทุกวันที่มาช่วยไต่อันดับได้";
  }

  return (
    <div className="w-full rounded-xl border border-gold-dim bg-card">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-text">{headline}</p>
          <p className="truncate text-[11px] text-text3">{subline}</p>
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-text3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          expanded ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-border px-3 py-2">
          {loadingTop5 && top5 === null ? (
            <p className="py-2 text-center text-xs text-text3">กำลังโหลด...</p>
          ) : (
            <ul className="flex flex-col gap-1 py-1">
              {(top5 ?? []).map((row) => {
                const isMe = inTop5 && row.rnk === myRank;
                return (
                  <li
                    key={row.rnk}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                      isMe ? "bg-gold-dim/40 text-gold-hi" : "text-text2"
                    }`}
                  >
                    <span className="w-4 shrink-0 text-center font-bold">{row.rnk}</span>
                    {row.rnk === 1 && <Crown size={14} className="shrink-0 text-gold" />}
                    <span className="min-w-0 flex-1 truncate">
                      {row.username}
                      {isMe && <span className="ml-1 text-[10px] text-text3">(เธอ)</span>}
                    </span>
                    <span className="shrink-0 font-bold">{row.total_points}</span>
                  </li>
                );
              })}
              {!inTop5 && (
                <li className="flex items-center gap-2 rounded-lg bg-amber/15 px-2 py-1.5 text-xs text-text">
                  <span className="w-4 shrink-0 text-center font-bold text-amber">~{myRank}</span>
                  <span className="min-w-0 flex-1 truncate">คุณ</span>
                  <span className="shrink-0 font-bold text-amber">{points}</span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
