"use client";

import { useEffect, useMemo, useState } from "react";
import BattleCentral from "../../[sessionId]/battle/BattleCentral";
import {
  PREVIEW_CLOCK,
  PREVIEW_EFFECTS,
  PREVIEW_OUTCOMES,
  PREVIEW_REASONS,
  PREVIEW_SCENARIOS,
  PREVIEW_SIZES,
  buildPreviewRoster,
  buildPreviewView,
  type PreviewParams,
} from "@/lib/teamBattle/previewFixtures";

// เฟรมความละเอียดจริงของโปรเจกเตอร์: iframe ขนาดคงที่ + ย่อด้วย transform
// (กล่องจอกลางใช้ min(1600px,177.78vh,100vw) และ cqw จึงต้องวัดในวิวพอร์ตขนาดจริง — iframe ให้วิวพอร์ตของมันเอง)
const FRAMES: { w: number; h: number; scale: number }[] = [
  { w: 1920, h: 1080, scale: 0.3 },
  { w: 1366, h: 768, scale: 0.42 },
  { w: 1280, h: 720, scale: 0.44 },
];

export default function BattlePreviewClient({
  params,
  bare,
  play,
}: {
  params: PreviewParams;
  bare: boolean;
  play: boolean;
}) {
  return bare ? <BareStage params={params} play={play} /> : <Controls initial={params} />;
}

// โหมด bare: BattleCentral อย่างเดียว (readOnly) — play=1 เริ่มที่ผลยกก่อนหน้าแล้วสลับเป็นผลยกใหม่ เพื่อให้เลขลอย/สั่นเล่น
function BareStage({ params, play }: { params: PreviewParams; play: boolean }) {
  const [started, setStarted] = useState(!play);
  useEffect(() => {
    if (!play) return;
    const t = setTimeout(() => setStarted(true), 400);
    return () => clearTimeout(t);
  }, [play]);
  const view = useMemo(() => buildPreviewView(params, { lastRoundNo: started ? 4 : 3 }), [params, started]);
  const roster = useMemo(() => buildPreviewRoster(params.size), [params.size]);
  return <BattleCentral view={view} clock={PREVIEW_CLOCK} roster={roster} readOnly />;
}

function Controls({ initial }: { initial: PreviewParams }) {
  const [p, setP] = useState<PreviewParams>(initial);
  const [seq, setSeq] = useState(0);
  const query = new URLSearchParams({
    bare: "1",
    play: "1",
    size: p.size ?? "20",
    scenario: p.scenario,
    effect: p.effect ?? "none",
    outcome: p.outcome,
    reason: p.reason,
    seq: String(seq),
  }).toString();
  const src = `/teacher/preview/battle?${query}`;
  const sel = "rounded-lg border border-border bg-card px-2 py-1 text-sm text-text";

  return (
    <main className="min-h-screen bg-bg p-4 text-text" data-testid="battle-preview-controls">
      <h1 className="text-lg font-bold text-gold-hi">Team Battle · preview จอกลาง (ข้อมูลจำลอง)</h1>
      <p className="mt-1 text-xs text-text3">dev เท่านั้น — ไม่เรียก RPC/realtime/Supabase และไม่มีชื่อรายคน</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-text2">ผู้เล่นต่อทีม</span>
        {PREVIEW_SIZES.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => {
              setP({ ...p, size: z });
              setSeq((n) => n + 1);
            }}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              (p.size ?? "20") === z ? "border-gold bg-amber text-on-amber" : "border-border text-text2"
            }`}
          >
            {z === "none" ? "ไม่มีแถว" : z === "11v10" ? "11 vs 10" : z}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PREVIEW_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setP({ ...p, scenario: s.id });
              setSeq((n) => n + 1);
            }}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              p.scenario === s.id ? "border-gold bg-amber text-on-amber" : "border-border text-text2"
            }`}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSeq((n) => n + 1)}
          className="rounded-xl border border-gold-dim px-3 py-1.5 text-sm text-gold-hi"
        >
          เล่นผลยกซ้ำ
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text2">
        <label className="flex items-center gap-1">
          เอฟเฟกต์ (กำลังตอบ)
          <select
            className={sel}
            value={p.effect ?? "none"}
            onChange={(e) => {
              setP({ ...p, effect: e.target.value === "none" ? null : (e.target.value as PreviewParams["effect"]) });
              setSeq((n) => n + 1);
            }}
          >
            <option value="none">ไม่มี</option>
            {PREVIEW_EFFECTS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          ผล (จบเกม)
          <select
            className={sel}
            value={p.outcome}
            onChange={(e) => {
              setP({ ...p, outcome: e.target.value as PreviewParams["outcome"] });
              setSeq((n) => n + 1);
            }}
          >
            {PREVIEW_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          เหตุผลจบเกม
          <select
            className={sel}
            value={p.reason}
            onChange={(e) => {
              setP({ ...p, reason: e.target.value as PreviewParams["reason"] });
              setSeq((n) => n + 1);
            }}
          >
            {PREVIEW_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-gold-hi underline">
          เปิดเต็มจอในแท็บใหม่ (ปรับหน้าต่างเองได้)
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        {FRAMES.map((f) => (
          <figure key={f.w}>
            <figcaption className="mb-1 text-xs text-text3">
              {f.w}×{f.h}
            </figcaption>
            <div className="overflow-hidden border border-border" style={{ width: f.w * f.scale, height: f.h * f.scale }}>
              <iframe
                key={`${f.w}-${src}`}
                title={`preview ${f.w}x${f.h}`}
                src={src}
                style={{
                  width: f.w,
                  height: f.h,
                  border: 0,
                  transform: `scale(${f.scale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </figure>
        ))}
      </div>
    </main>
  );
}
