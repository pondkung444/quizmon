"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, TrendingUp, TriangleAlert } from "lucide-react";
import type { ClassChapter, ClassOverview as Data, ClassStudent } from "@/lib/guardianClassOverview";
import { accuracyTextClass, subjectLabel } from "./[studentId]/overview/shared";

type Metric = "active" | "q" | "acc";
type SortKey = "attn" | "q" | "acc";

const COLLAPSED_ROWS = 10;
const STATUS_RANK = { gone: 0, low: 1, ok: 2 } as const;

function pctChange(now: number, prev: number): string | null {
  if (prev <= 0) return null;
  const p = Math.round(((now - prev) / prev) * 100);
  return `${p >= 0 ? "+" : ""}${p}%`;
}

function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${i * 10},${18 - Math.round((v / max) * 16)}`).join(" ");
  return (
    <svg width="62" height="20" viewBox="0 0 60 20" aria-hidden="true">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function StatusTag({ s }: { s: ClassStudent }) {
  if (s.status === "gone") {
    const label = s.last_active === null ? "ยังไม่เริ่ม" : `หายไป ${s.days_since} วัน`;
    return <span className="rounded-full bg-red/15 px-2 py-0.5 text-[11px] text-red">{label}</span>;
  }
  if (s.status === "low") {
    return <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">แม่นต่ำ</span>;
  }
  return null;
}

function Kpi({ label, value, sub, subClass = "text-text3" }: { label: string; value: string; sub?: string; subClass?: string }) {
  return (
    <div className="gd-row p-3">
      <p className="text-xs text-text3">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${subClass}`}>{sub}</p>}
    </div>
  );
}

function ChapterList({ rows, tone }: { rows: ClassChapter[]; tone: "good" | "bad" }) {
  if (rows.length === 0) {
    return <p className="text-sm text-text3">ยังมีข้อมูลไม่พอ (ต้องมีอย่างน้อย 20 ข้อจากนักเรียน 2 คนขึ้นไป)</p>;
  }
  return (
    <ul className="flex flex-col">
      {rows.map((c) => (
        <li
          key={`${c.subject}-${c.branch ?? ""}-${c.chapter}`}
          className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0"
        >
          <span className="min-w-0 text-sm text-text">
            <span className="block truncate">{c.chapter}</span>
            <span className="block truncate text-xs text-text3">
              {subjectLabel(c.subject, c.branch)} · {c.students} คน {c.n} ข้อ
            </span>
          </span>
          <span className={`flex-none text-sm font-bold ${tone === "good" ? "text-good" : accuracyTextClass(c.acc)}`}>
            {c.acc}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ClassOverview({ data, grade }: { data: Data; grade: string | null }) {
  const [metric, setMetric] = useState<Metric>("active");
  const [sort, setSort] = useState<SortKey>("attn");
  const [showAll, setShowAll] = useState(false);

  const { students, daily, compare } = data;
  const today = daily[daily.length - 1];
  const yesterday = daily[daily.length - 2];
  const total = students.length;
  const attention = students.filter((s) => s.status !== "ok").length;

  const todayAcc = today && today.q > 0 ? Math.round((today.correct / today.q) * 100) : null;
  const weekAcc = compare.this.q > 0 ? Math.round((compare.this.correct / compare.this.q) * 100) : null;
  const prevAcc = compare.prev.q > 0 ? Math.round((compare.prev.correct / compare.prev.q) * 100) : null;

  const activeDiff = today && yesterday ? today.active - yesterday.active : 0;
  const accDiff = todayAcc !== null && weekAcc !== null ? todayAcc - weekAcc : null;

  const series = useMemo(
    () =>
      daily.map((d) => (metric === "active" ? d.active : metric === "q" ? d.q : d.q > 0 ? Math.round((d.correct / d.q) * 100) : 0)),
    [daily, metric]
  );
  const maxV = Math.max(...series, 1);

  const note = useMemo(() => {
    if (metric === "active") {
      const ch = pctChange(compare.this.active_avg, compare.prev.active_avg);
      return `สัปดาห์นี้มีคนเข้าใช้เฉลี่ย ${compare.this.active_avg} คน/วัน${
        ch ? ` เทียบสัปดาห์ก่อน ${compare.prev.active_avg} คน (${ch})` : " (สัปดาห์ก่อนยังไม่มีข้อมูล)"
      }`;
    }
    if (metric === "q") {
      const ch = pctChange(compare.this.q, compare.prev.q);
      return `สัปดาห์นี้ตอบรวม ${compare.this.q.toLocaleString("th-TH")} ข้อ${
        ch ? ` เทียบสัปดาห์ก่อน ${compare.prev.q.toLocaleString("th-TH")} ข้อ (${ch})` : " (สัปดาห์ก่อนยังไม่มีข้อมูล)"
      }`;
    }
    if (weekAcc === null) return "สัปดาห์นี้ยังไม่มีข้อมูลความแม่น";
    return `ความแม่นเฉลี่ยสัปดาห์นี้ ${weekAcc}%${
      prevAcc !== null ? ` เทียบสัปดาห์ก่อน ${prevAcc}% (${weekAcc - prevAcc >= 0 ? "+" : ""}${weekAcc - prevAcc})` : " (สัปดาห์ก่อนยังไม่มีข้อมูล)"
    }`;
  }, [metric, compare, weekAcc, prevAcc]);

  const sorted = useMemo(() => {
    const arr = [...students];
    arr.sort((a, b) => {
      if (sort === "q") return b.today_q - a.today_q;
      if (sort === "acc") return (b.acc7 ?? -1) - (a.acc7 ?? -1);
      return STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.today_q - b.today_q;
    });
    return arr;
  }, [students, sort]);
  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED_ROWS);

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition ${
      on ? "border-mint bg-mint/15 font-bold text-mint" : "border-border text-text2 hover:bg-card"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {data.grades.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="กรองตามระดับชั้น">
          <Link href="/guardian" className={chip(grade === null)}>
            ทุกชั้น
          </Link>
          {data.grades.map((g) => (
            <Link key={g} href={`/guardian?grade=${encodeURIComponent(g)}`} className={chip(grade === g)}>
              {g}
            </Link>
          ))}
        </div>
      )}

      {total === 0 ? (
        <div className="gd-card p-6 text-center text-sm text-text2">ไม่มีนักเรียนในระดับชั้นนี้</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="เข้าใช้วันนี้"
              value={`${today?.active ?? 0} / ${total}`}
              sub={yesterday ? `${activeDiff >= 0 ? "+" : ""}${activeDiff} จากเมื่อวาน` : undefined}
              subClass={activeDiff >= 0 ? "text-good" : "text-red"}
            />
            <Kpi
              label="ตอบแล้ววันนี้"
              value={`${(today?.q ?? 0).toLocaleString("th-TH")} ข้อ`}
              sub={today && today.active > 0 ? `เฉลี่ย ${Math.round(today.q / today.active)} ข้อ/คน` : "ยังไม่มีใครเริ่ม"}
            />
            <Kpi
              label="ความแม่นวันนี้"
              value={todayAcc === null ? "–" : `${todayAcc}%`}
              sub={accDiff === null ? undefined : `${accDiff >= 0 ? "+" : ""}${accDiff} จากค่าเฉลี่ย 7 วัน`}
              subClass={accDiff !== null && accDiff < 0 ? "text-red" : "text-good"}
            />
            <Kpi
              label="ควรดูแลเป็นพิเศษ"
              value={`${attention} คน`}
              sub="หายไป 3 วัน+ หรือแม่นต่ำ"
              subClass={attention > 0 ? "text-warn" : "text-text3"}
            />
          </div>

          <section className="gd-card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">แนวโน้ม 14 วัน</h2>
              <div className="flex gap-1.5" role="group" aria-label="เลือกตัวชี้วัด">
                <button type="button" className={chip(metric === "active")} onClick={() => setMetric("active")}>
                  คนที่เข้าใช้
                </button>
                <button type="button" className={chip(metric === "q")} onClick={() => setMetric("q")}>
                  ข้อที่ตอบ
                </button>
                <button type="button" className={chip(metric === "acc")} onClick={() => setMetric("acc")}>
                  ความแม่น
                </button>
              </div>
            </div>
            <svg viewBox="0 0 640 124" width="100%" role="img" aria-label="แนวโน้ม 14 วัน" className="text-mint">
              {series.map((v, i) => {
                const w = 640 / series.length;
                const h = Math.round((v / maxV) * 80);
                return (
                  <g key={daily[i].d}>
                    <rect
                      x={i * w + 6}
                      y={96 - h}
                      width={w - 12}
                      height={Math.max(h, 1)}
                      rx="3"
                      fill="currentColor"
                      opacity={i === series.length - 1 ? 1 : 0.45}
                    />
                    <text x={i * w + w / 2} y={92 - h} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.8">
                      {v > 0 ? (metric === "acc" ? `${v}%` : v) : ""}
                    </text>
                  </g>
                );
              })}
              <text x="6" y="116" fontSize="11" fill="currentColor" opacity="0.6">
                {dayLabel(daily[0].d)}
              </text>
              <text x="634" y="116" textAnchor="end" fontSize="11" fill="currentColor" opacity="0.6">
                วันนี้
              </text>
            </svg>
            <p className="mt-1 text-xs text-text2">{note}</p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="gd-card p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                <TrendingUp className="h-4 w-4 text-good" aria-hidden="true" />
                บทที่ทำได้ดี
              </h2>
              <ChapterList rows={data.chapters_good} tone="good" />
            </section>
            <section className="gd-card p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-text">
                <TriangleAlert className="h-4 w-4 text-warn" aria-hidden="true" />
                บทที่ควรช่วย
              </h2>
              <ChapterList rows={data.chapters_bad} tone="bad" />
            </section>
          </div>

          <section className="gd-card p-3 md:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-sm font-bold text-text">นักเรียนรายคน</h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-text3">
                เรียงตาม
                <button type="button" className={chip(sort === "attn")} onClick={() => setSort("attn")}>
                  ต้องดูแล
                </button>
                <button type="button" className={chip(sort === "q")} onClick={() => setSort("q")}>
                  ข้อวันนี้
                </button>
                <button type="button" className={chip(sort === "acc")} onClick={() => setSort("acc")}>
                  ความแม่น
                </button>
              </div>
            </div>

            <div className="hidden grid-cols-[minmax(0,1.6fr)_64px_72px_52px_minmax(0,1.2fr)_16px] gap-3 px-2 pb-1 text-[11px] text-text3 md:grid">
              <span>ชื่อ</span>
              <span>วันนี้</span>
              <span>7 วัน</span>
              <span>แม่น</span>
              <span>เป้าสัปดาห์</span>
              <span />
            </div>

            <ul>
              {visible.map((s) => {
                const goalPct =
                  s.goal_target && s.goal_points !== null
                    ? Math.min(100, Math.round((s.goal_points / s.goal_target) * 100))
                    : null;
                const dot = s.status === "ok" ? "bg-good" : s.status === "low" ? "bg-warn" : "bg-red";
                return (
                  <li key={s.student_id} className="border-t border-border first:border-t-0">
                    <Link
                      href={`/guardian/${s.student_id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition hover:bg-track md:grid-cols-[minmax(0,1.6fr)_64px_72px_52px_minmax(0,1.2fr)_16px]"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`h-2 w-2 flex-none rounded-full ${dot}`} />
                        <span className="truncate font-medium text-text">{s.username}</span>
                        {s.grade_level && <span className="text-xs text-text3">{s.grade_level}</span>}
                        <StatusTag s={s} />
                      </span>
                      <span className="text-text2">
                        {s.today_q > 0 ? `${s.today_q} ข้อ` : "–"}
                        <span className="ml-2 text-xs text-text3 md:hidden">
                          {s.acc7 !== null ? `แม่น ${s.acc7}%` : ""}
                        </span>
                      </span>
                      <span className="hidden text-mint md:block">
                        <Sparkline values={s.q7} />
                      </span>
                      <span className={`hidden md:block ${s.acc7 !== null ? accuracyTextClass(s.acc7) : "text-text3"}`}>
                        {s.acc7 !== null ? `${s.acc7}%` : "–"}
                      </span>
                      <span className="hidden md:block">
                        {goalPct === null ? (
                          <span className="text-xs text-text3">ยังไม่ตั้งเป้า</span>
                        ) : (
                          <span className="block h-1.5 overflow-hidden rounded-full bg-track" title={`${s.goal_points}/${s.goal_target} แต้ม`}>
                            <span className="block h-full rounded-full bg-amber" style={{ width: `${goalPct}%` }} />
                          </span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 text-text3" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            {total > COLLAPSED_ROWS && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 px-2 text-xs text-gold-hi underline"
              >
                {showAll ? "แสดงน้อยลง" : `ดูทั้งหมด ${total} คน`}
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
