"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Flame, CalendarCheck, Trophy, Egg } from "lucide-react";
import { resolvePetDisplay } from "@/components/social/petSummary";
import { loadRanking } from "@/app/social/actions";
import type { RankingCategory, RankingData, RankingRow, RankingScope } from "@/lib/ranking";

// "ดูวิธีเริ่มต้น" ปลายทางไม่ได้ระบุในเอกสาร §12.1 — เลือกทางที่สมเหตุสมผลต่อหมวด (ฝึกประจำสัปดาห์/
// ความสม่ำเสมอ มาจากการตอบคำถาม → /quiz, Achievement → /achievements, นักสะสม → /eggs ฟักไข่ใหม่)
const CATEGORY_CONFIG: Record<
  RankingCategory,
  { label: string; suffix: string; icon: typeof Flame; getStartedHref: string }
> = {
  weekly_training: { label: "การฝึกประจำสัปดาห์", suffix: "คะแนน", icon: Flame, getStartedHref: "/quiz" },
  consistency: { label: "ความสม่ำเสมอ", suffix: "วัน", icon: CalendarCheck, getStartedHref: "/quiz" },
  achievement: { label: "Achievement", suffix: "แต้ม", icon: Trophy, getStartedHref: "/achievements" },
  collector: { label: "นักสะสม Qmon", suffix: "แบบ", icon: Egg, getStartedHref: "/eggs" },
};
const CATEGORY_ORDER: RankingCategory[] = ["weekly_training", "consistency", "achievement", "collector"];

function rowHref(row: RankingRow, scope: RankingScope): string {
  if (scope === "all") return `/social/profile/${row.userId}`;
  if (row.isMe) return "/social?tab=profile";
  return `/social/friend/${row.userId}`;
}

function RankingRowItem({ row, scope, suffix }: { row: RankingRow; scope: RankingScope; suffix: string }) {
  const { imagePath, speciesName } = row.pet ? resolvePetDisplay(row.pet) : { imagePath: null, speciesName: "" };
  return (
    <Link
      href={rowHref(row, scope)}
      prefetch={false}
      className={`flex items-center gap-3 rounded-2xl border p-3 transition active:scale-95 ${
        row.isMe ? "border-gold bg-gold-dim/15" : "border-gold-dim bg-card"
      }`}
    >
      <span className="w-7 flex-none text-center text-sm font-bold text-text3">{row.rank ?? "—"}</span>
      <div className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full border border-gold-dim bg-track">
        {imagePath && (
          <Image src={imagePath} alt={speciesName} width={40} height={40} className="h-full w-full object-contain" />
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-bold text-text">{row.username}</p>
      <p className="flex-none text-sm font-bold text-gold-hi">
        {row.scoreValue != null ? `${row.scoreValue} ${suffix}` : "—"}
      </p>
    </Link>
  );
}

// S01 (§9) — โครง: pill toggle ขอบเขต (ทั้งหมด/เพื่อน) → grid 2×2 เลือกหมวด → รายการอันดับ
// สลับหมวด/ขอบเขตเรียก loadRanking (server action) ใหม่ทุกครั้ง ไม่ prefetch ล่วงหน้าทั้ง 8 ชุด
export default function RankingTabView({
  initialCategory,
  initialScope,
  initialData,
  friendCount,
}: {
  initialCategory: RankingCategory;
  initialScope: RankingScope;
  initialData: RankingData;
  friendCount: number;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [scope, setScope] = useState(initialScope);
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refetch(nextCategory: RankingCategory, nextScope: RankingScope) {
    setError(null);
    startTransition(async () => {
      try {
        const next = await loadRanking(nextCategory, nextScope);
        setData(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "โหลดอันดับไม่สำเร็จ");
      }
    });
  }

  function handleScopeChange(nextScope: RankingScope) {
    if (nextScope === scope) return;
    setScope(nextScope);
    refetch(category, nextScope);
  }

  function handleCategoryChange(nextCategory: RankingCategory) {
    if (nextCategory === category) return;
    setCategory(nextCategory);
    refetch(nextCategory, scope);
  }

  const suffix = CATEGORY_CONFIG[category].suffix;
  const showFriendsEmptyState = scope === "friends" && friendCount === 0;

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleScopeChange("all")}
          className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${
            scope === "all" ? "bg-amber text-track" : "border border-gold-dim text-text3"
          }`}
        >
          ทั้งหมด
        </button>
        <button
          type="button"
          onClick={() => handleScopeChange("friends")}
          className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${
            scope === "friends" ? "bg-amber text-track" : "border border-gold-dim text-text3"
          }`}
        >
          เพื่อน
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CATEGORY_ORDER.map((key) => {
          const cfg = CATEGORY_CONFIG[key];
          const Icon = cfg.icon;
          const active = category === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleCategoryChange(key)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border p-3 text-center transition active:scale-95 ${
                active ? "border-gold bg-amber/15 text-amber" : "border-gold-dim bg-card text-text3"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-bold">{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-center text-sm text-red">{error}</p>}

      {showFriendsEmptyState ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold-dim bg-card p-8 text-center">
          <p className="text-sm text-text3">ยังไม่มีเพื่อนในอันดับนี้</p>
          <Link
            href="/social/add-friend"
            className="flex min-h-11 items-center justify-center rounded-xl border border-gold bg-amber px-4 text-sm font-bold text-track transition active:scale-95"
          >
            เพิ่มเพื่อน
          </Link>
        </div>
      ) : data.rows.length === 0 ? (
        <p className="rounded-2xl border border-gold-dim bg-card p-6 text-center text-sm text-text3">
          ยังไม่มีใครติดอันดับหมวดนี้
        </p>
      ) : (
        <div className={`flex flex-col gap-2 ${isPending ? "opacity-50" : ""}`}>
          {data.rows.map((row) => (
            <RankingRowItem key={row.userId} row={row} scope={scope} suffix={suffix} />
          ))}
        </div>
      )}

      {data.myRank && (
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-6"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-gold bg-card p-3 shadow-lg">
            {data.myRank.found ? (
              <>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber/15 text-sm font-bold text-amber">
                  {data.myRank.rank}
                </span>
                <p className="flex-1 text-sm font-bold text-text">อันดับของคุณ</p>
                <p className="text-sm font-bold text-gold-hi">
                  {data.myRank.scoreValue} {suffix}
                </p>
              </>
            ) : (
              <>
                <p className="flex-1 text-sm font-bold text-text">คุณยังไม่ติดอันดับ</p>
                <Link
                  href={CATEGORY_CONFIG[category].getStartedHref}
                  className="flex-none rounded-xl border border-gold bg-amber px-3 py-2 text-xs font-bold text-track transition active:scale-95"
                >
                  ดูวิธีเริ่มต้น
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
