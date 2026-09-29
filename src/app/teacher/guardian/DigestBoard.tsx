"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateDigest, saveDigestEdit } from "./actions";
import { SITUATION_LABEL_TH, type DigestRow } from "@/lib/guardian/digest";

type CardState = {
  body: string;
  savedBody: string;
  warnings: string[];
  error: string | null;
  busy: boolean;
  copied: boolean;
};

const CONCURRENCY = 2;
const CONTEXT_MAX = 500;

function formatWeek(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

export default function DigestBoard({
  weekStart,
  weekOptions,
  isCurrentWeek,
  isSunday,
  rows,
}: {
  weekStart: string;
  weekOptions: string[];
  isCurrentWeek: boolean;
  isSunday: boolean;
  rows: DigestRow[];
}) {
  const router = useRouter();
  const [context, setContext] = useState(() => rows.find((r) => r.saved?.context)?.saved?.context ?? "");
  const [cards, setCards] = useState<Record<string, CardState>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.student_id,
        {
          body: r.saved?.body ?? "",
          savedBody: r.saved?.body ?? "",
          warnings: [],
          error: null,
          busy: false,
          copied: false,
        },
      ])
    )
  );
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function patch(id: string, p: Partial<CardState>) {
    setCards((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  async function generateOne(studentId: string) {
    patch(studentId, { busy: true, error: null, warnings: [] });
    const res = await generateDigest(studentId, weekStart, context);
    if (res.body) {
      // error ไม่ว่าง (เจนได้แต่บันทึกไม่สำเร็จ) → คง savedBody เดิม เพื่อให้ blur ครั้งถัดไปลองบันทึกใหม่
      patch(studentId, {
        busy: false,
        body: res.body,
        savedBody: res.error ? cards[studentId].savedBody : res.body,
        warnings: res.warnings,
        error: res.error,
      });
    } else {
      patch(studentId, { busy: false, error: res.error ?? "เจนไม่สำเร็จ" });
    }
  }

  async function generateMany(ids: string[]) {
    if (progress) return;
    setProgress({ done: 0, total: ids.length });
    const queue = [...ids];
    let done = 0;
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        await generateOne(id);
        done += 1;
        setProgress({ done, total: ids.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
    setProgress(null);
  }

  function handleGenerateMissing() {
    const ids = rows.filter((r) => !cards[r.student_id].body).map((r) => r.student_id);
    if (ids.length > 0) void generateMany(ids);
  }

  function handleRegenerateOne(studentId: string) {
    if (cards[studentId].body && !window.confirm("เจนใหม่จะทับข้อความเดิม รวมถึงที่แก้ไว้ด้วย ยืนยันไหม?")) return;
    void generateOne(studentId);
  }

  function handleRegenerateAll() {
    if (!window.confirm("เจนใหม่ทั้งหมดจะทับข้อความเดิม รวมถึงที่แก้ไว้ด้วย ยืนยันไหม?")) return;
    void generateMany(rows.map((r) => r.student_id));
  }

  async function handleBlur(studentId: string) {
    const c = cards[studentId];
    if (c.body === c.savedBody || c.busy) return;
    const { error } = await saveDigestEdit(studentId, weekStart, c.body, context);
    if (error) patch(studentId, { error });
    else patch(studentId, { savedBody: c.body, error: null });
  }

  async function handleCopy(studentId: string) {
    try {
      await navigator.clipboard.writeText(cards[studentId].body);
      patch(studentId, { copied: true });
      setTimeout(() => patch(studentId, { copied: false }), 1500);
    } catch {
      patch(studentId, { error: "คัดลอกไม่สำเร็จ" });
    }
  }

  const missingCount = rows.filter((r) => !cards[r.student_id].body).length;
  const generating = progress !== null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-gold-hi">สรุปรายสัปดาห์ถึงผู้ปกครอง</h1>

      <label className="flex flex-col gap-1 text-sm text-text2">
        สัปดาห์
        <select
          value={weekStart}
          onChange={(e) => router.push(`/teacher/guardian?week=${e.target.value}`)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-text"
        >
          {weekOptions.map((w) => (
            <option key={w} value={w}>
              {formatWeek(w)}
              {w === weekOptions[0] ? " (สัปดาห์นี้)" : ""}
            </option>
          ))}
        </select>
      </label>

      {isCurrentWeek && !isSunday && (
        <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          สัปดาห์นี้ยังไม่จบ ตัวเลขอาจยังไม่ครบ — ปกติเปิดตอนเย็นวันอาทิตย์
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-text2">
        บริบทของสัปดาห์ (ไม่บังคับ)
        <textarea
          value={context}
          maxLength={CONTEXT_MAX}
          rows={2}
          onChange={(e) => setContext(e.target.value)}
          placeholder="เช่น ช่วงสอบกลางภาค"
          className="rounded-xl border border-border bg-card px-3 py-2 text-base text-text"
        />
        <span className="self-end text-xs text-text3">
          {context.length}/{CONTEXT_MAX}
        </span>
      </label>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-text3">ยังไม่มีเด็กที่ผูกผู้พิทักษ์ในสัปดาห์นี้</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generating || missingCount === 0}
              onClick={handleGenerateMissing}
              className="min-h-[44px] rounded-xl bg-gold-hi/20 px-4 text-sm font-bold text-gold-hi disabled:opacity-50"
            >
              เจนที่ยังไม่มี ({missingCount})
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={handleRegenerateAll}
              className="min-h-[44px] rounded-xl border border-border px-4 text-sm text-text2 disabled:opacity-50"
            >
              เจนใหม่ทั้งหมด
            </button>
            {progress && (
              <span className="self-center text-sm text-text3">
                กำลังเจน {progress.done}/{progress.total}
              </span>
            )}
          </div>

          {rows.map((r) => {
            const c = cards[r.student_id];
            return (
              <section key={r.student_id} className="flex flex-col gap-2 rounded-2xl border border-gold-dim bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-text">{r.username}</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text2">
                    {SITUATION_LABEL_TH[r.stats.situation]}
                  </span>
                </div>
                <p className="text-xs text-text3">
                  เล่น {r.stats.days_played} วัน
                  {r.stats.goal ? ` · ${r.stats.goal.reached ? "ถึงเป้าแล้ว" : "ยังไม่ถึงเป้า"}` : ""}
                </p>

                <textarea
                  value={c.body}
                  rows={9}
                  disabled={c.busy}
                  onChange={(e) => patch(r.student_id, { body: e.target.value })}
                  onBlur={() => handleBlur(r.student_id)}
                  placeholder={c.busy ? "กำลังเจน..." : "ยังไม่มีข้อความ"}
                  className="rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-text disabled:opacity-60"
                />

                {c.warnings.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-amber">
                    {c.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                {c.error && <p className="text-sm text-red">{c.error}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={c.busy || generating}
                    onClick={() => handleRegenerateOne(r.student_id)}
                    className="min-h-[44px] flex-1 rounded-xl border border-border text-sm text-text2 disabled:opacity-50"
                  >
                    {c.busy ? "กำลังเจน..." : "เจนใหม่"}
                  </button>
                  <button
                    type="button"
                    disabled={!c.body || c.busy}
                    onClick={() => handleCopy(r.student_id)}
                    className="min-h-[44px] flex-1 rounded-xl bg-gold-hi/20 text-sm font-bold text-gold-hi disabled:opacity-50"
                  >
                    {c.copied ? "คัดลอกแล้ว" : "คัดลอก"}
                  </button>
                </div>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
