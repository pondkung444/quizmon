"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { explainBattleError } from "@/lib/teamBattle/errors";
import { teacherRpc } from "@/lib/teamBattle/rpc";
import {
  DEFAULT_TIMINGS,
  TIMING_RANGE,
  buildConfig,
  buildScopeConfig,
  subjectGroups,
  timingProblems,
  type ChapterRow,
  type Timings,
} from "@/lib/teamBattle/scope";
import type { BattleConfig, QuestionCount } from "@/lib/teamBattle/types";
import ScopePicker, { type CountStatus, type ScopeValue } from "./ScopePicker";

const COUNT_DEBOUNCE_MS = 400;

// ไม่มีเกมเปิดอยู่: เลือกขอบเขต + ตั้งเวลา → สร้างเกม (rewards_enabled/eggs_enabled ไม่ส่ง = ค่าเริ่มต้นของ DB)
export default function CreatePanel({
  sessionId,
  onCreated,
}: {
  sessionId: string;
  onCreated: (battleId: string) => void;
}) {
  const [rows, setRows] = useState<ChapterRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeValue>({ band: null, groupKey: null, chapters: [] });
  const [truncated, setTruncated] = useState(false);
  const [timings, setTimings] = useState<Timings>(DEFAULT_TIMINGS);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ไม่ซ่อน primary (ต่างจาก Boss Raid) — Team Battle รองรับช่วงชั้นนี้
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .from("curriculum_chapter_availability")
      .select(
        "id, grade_band, grade_level, grade_order, subject, branch, subject_label, chapter, chapter_order, question_count, is_available"
      )
      .order("grade_order", { ascending: true })
      .order("chapter_order", { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setLoadError("โหลดรายการบทเรียนไม่สำเร็จ ลองรีเฟรชหน้านี้อีกครั้ง");
        else setRows((data ?? []) as ChapterRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const group = useMemo(() => {
    if (!rows || !scope.band || !scope.groupKey) return null;
    return subjectGroups(rows, scope.band).find((g) => g.key === scope.groupKey) ?? null;
  }, [rows, scope.band, scope.groupKey]);

  // นับโจทย์ — debounce ~400 ms, เฉพาะขอบเขต (ไม่ผูกกับค่าเวลา)
  const countKey =
    group && scope.band && scope.chapters.length > 0
      ? JSON.stringify(buildScopeConfig({ band: scope.band, group, chapters: scope.chapters }))
      : null;
  const [counted, setCounted] = useState<{
    key: string;
    value?: QuestionCount;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!countKey) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const cfg = JSON.parse(countKey) as Partial<BattleConfig>;
      try {
        const value = await teacherRpc.questionCount(sessionId, cfg);
        if (!cancelled) setCounted({ key: countKey, value });
      } catch (e) {
        if (!cancelled) setCounted({ key: countKey, error: explainBattleError(e).message });
      }
    }, COUNT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [sessionId, countKey]);

  const current = countKey && counted?.key === countKey ? counted : null;
  const status: CountStatus = !countKey
    ? { kind: "idle" }
    : !current
      ? { kind: "pending" }
      : current.error
        ? { kind: "error", message: current.error }
        : { kind: "result", level: current.value!.level, count: current.value!.count };

  const problems = timingProblems(timings);
  const blocked = status.kind === "result" && status.level === "block";
  const canCreate =
    !!group && !!scope.band && scope.chapters.length > 0 && status.kind === "result" && !blocked && problems.length === 0 && !creating;

  async function create() {
    if (!group || !scope.band) return;
    setCreating(true);
    setError(null);
    try {
      const id = await teacherRpc.create(
        sessionId,
        buildConfig({ band: scope.band, group, chapters: scope.chapters, timings })
      );
      onCreated(id);
    } catch (e) {
      setError(explainBattleError(e).message);
      setCreating(false);
    }
  }

  if (loadError) return <p className="mt-6 text-center text-sm text-red">{loadError}</p>;
  if (!rows) return <p className="mt-6 text-center text-sm text-text3">กำลังโหลดรายการบทเรียน…</p>;

  return (
    <div className="mt-5 space-y-4">
      <ScopePicker
        rows={rows}
        value={scope}
        onChange={setScope}
        status={status}
        truncated={truncated}
        onTruncated={setTruncated}
      />

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-bold text-gold-hi">2. ตั้งเวลา</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(Object.keys(TIMING_RANGE) as (keyof Timings)[]).map((k) => (
            <label key={k} className="text-sm text-text2">
              {TIMING_RANGE[k].label}
              <input
                type="number"
                inputMode="numeric"
                min={TIMING_RANGE[k].min}
                max={TIMING_RANGE[k].max}
                value={Number.isNaN(timings[k]) ? "" : timings[k]}
                onChange={(e) => setTimings((t) => ({ ...t, [k]: e.target.value === "" ? NaN : Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-border bg-track px-3 py-2 text-text"
              />
              <span className="text-xs text-text3">
                {TIMING_RANGE[k].min}–{TIMING_RANGE[k].max}
              </span>
            </label>
          ))}
        </div>
        {problems.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm text-red">{error}</p>}

      <button
        type="button"
        disabled={!canCreate}
        onClick={() => void create()}
        className="w-full rounded-2xl border border-gold bg-amber py-3.5 text-lg font-bold text-on-amber transition active:scale-95 disabled:opacity-40"
      >
        {creating ? "กำลังสร้างเกม…" : "สร้างเกม Team Battle"}
      </button>
    </div>
  );
}
