"use client";

import type { CategoryStat, NotEnoughDataTopic, TopicStatsResult } from "@/lib/topicStats";

export default function TopicStatsSheet({
  stats,
  onClose,
}: {
  stats: TopicStatsResult;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-gold-dim bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h2 className="mb-1 text-sm font-bold text-gold-hi">สถิติแยกบท 7 วันล่าสุด</h2>
        <p className="mb-4 text-xs text-text3">นับรวมทุกวิชา คณิต + วิทย์ ของทุก Qmon ที่เคยเลี้ยง</p>

        {!stats.hasAnyData ? (
          <p className="rounded-xl bg-track p-4 text-center text-sm text-text3">
            ยังไม่มีข้อมูลสัปดาห์นี้ ลองตอบคำถามดูก่อนนะ
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <TopicZone
              title="น่าฝึกเพิ่ม"
              topics={stats.needsPractice}
              tone="practice"
              emptyMessage="สัปดาห์นี้ทุกบทแข็งแรงหมดเลย! 🎉"
            />
            {stats.strong.length > 0 && <TopicZone title="แข็งแรง" topics={stats.strong} tone="strong" />}
            {stats.notEnoughData.length > 0 && <NotEnoughDataZone topics={stats.notEnoughData} />}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-gold-dim py-3 text-sm font-bold text-text2"
        >
          ปิด
        </button>
      </div>
    </div>
  );
}

function TopicZone({
  title,
  topics,
  tone,
  emptyMessage,
}: {
  title: string;
  topics: CategoryStat[];
  tone: "practice" | "strong";
  emptyMessage?: string;
}) {
  const toneClasses =
    tone === "practice"
      ? { border: "border-amber-dim", bg: "bg-amber/10", text: "text-amber" }
      : { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400" };

  if (topics.length === 0) {
    if (!emptyMessage) return null;
    return (
      <div>
        <h3 className="mb-2 text-xs font-bold text-text2">{title}</h3>
        <p
          className={`rounded-xl border ${toneClasses.border} ${toneClasses.bg} p-3 text-center text-sm ${toneClasses.text}`}
        >
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold text-text2">{title}</h3>
      <div className="flex flex-col gap-2">
        {topics.map((t) => (
          <div
            key={t.category}
            className={`flex items-center justify-between rounded-xl border ${toneClasses.border} ${toneClasses.bg} px-3 py-2`}
          >
            <span className="text-sm text-text">{t.category}</span>
            <span className={`text-sm font-bold ${toneClasses.text}`}>
              {t.pct}%{" "}
              <span className="text-xs font-normal text-text3">
                ({t.correct}/{t.attempted})
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotEnoughDataZone({ topics }: { topics: NotEnoughDataTopic[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold text-text2">ยังลองไม่มากพอ</h3>
      <div className="flex flex-col gap-2">
        {topics.map((t) => (
          <div
            key={t.category}
            className="flex items-center justify-between rounded-xl border border-border bg-track px-3 py-2"
          >
            <span className="text-sm text-text2">{t.category}</span>
            <span className="text-xs text-text3">{t.attempted} ข้อ</span>
          </div>
        ))}
      </div>
    </div>
  );
}
