"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatElapsed, useElapsedSeconds } from "@/lib/classroom/useFocusSession";

// แผงครูระหว่างคาบตั้งใจ — โชว์จำนวนรวมเท่านั้น ไม่โชว์ชื่อ/ผลรายคน
// จำนวนสดมาจาก get_focus_live_summary (server ประเมินคนที่เงียบไปก่อนนับ ไม่ค้างเป็น "ตั้งใจอยู่")

const LIVE_POLL_MS = 15_000;

type LiveSummary = {
  status: "running" | "ended";
  ended_reason: "host_ended" | "stale_timeout" | null;
  started_at: string;
  ended_at: string | null;
  total: number;
  focusing: number;
  warning: number;
  away: number;
  completed_blocks: number;
  /** คนที่ตั้งใจครบอย่างน้อย 1 รอบ 10 นาที */
  focused_students: number;
  focused_seconds: number;
  exp_awarded: number;
};

export default function FocusTeacherPanel({
  focusSessionId,
  startedAt,
  participantCount,
  pending,
  onStop,
}: {
  focusSessionId: string;
  startedAt: string;
  participantCount: number;
  pending: boolean;
  onStop: () => void;
}) {
  const elapsed = useElapsedSeconds(startedAt);
  const live = useFocusLiveSummary(focusSessionId, LIVE_POLL_MS);
  return (
    <div className="mt-4 rounded-2xl border border-gold-dim bg-card p-4 text-center">
      <p className="text-sm text-text2">กำลังคาบตั้งใจ</p>
      <p className="mt-1 font-mono text-4xl text-gold-hi">{formatElapsed(elapsed)}</p>
      <p className="mt-2 text-sm text-text2">นักเรียนในคาบ: {participantCount} คน</p>
      {live && live.total > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="ตั้งใจอยู่" value={live.focusing + live.warning} tone="text-good" />
          <Stat label="ยังไม่วาง/หลุด" value={live.away} tone="text-text2" />
          <Stat label="รอบ 10 นาทีที่ครบ" value={live.completed_blocks} tone="text-gold-hi" />
        </div>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={onStop}
        className="mt-4 w-full rounded-xl border border-gold bg-amber px-4 py-3 font-bold text-on-amber transition active:scale-95 disabled:opacity-50"
      >
        {pending ? "กำลังหยุด…" : "หยุดคาบตั้งใจ"}
      </button>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-track px-2 py-2">
      <p className={`font-mono text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] text-text3">{label}</p>
    </div>
  );
}

// pollMs = null → ดึงครั้งเดียว (สรุปหลังจบคาบ ตัวเลขไม่เปลี่ยนแล้ว)
function useFocusLiveSummary(focusSessionId: string, pollMs: number | null): LiveSummary | null {
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<LiveSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase.rpc("get_focus_live_summary", {
        p_focus_session_id: focusSessionId,
      });
      if (cancelled) return;
      if (error) {
        console.info(`[focus ${focusSessionId.slice(0, 8)}] live summary failed:`, error.message);
        return;
      }
      setSummary(data as LiveSummary);
    }
    void load();
    const id = pollMs === null ? null : setInterval(load, pollMs);
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [focusSessionId, pollMs, supabase]);
  return summary;
}

// สรุปท้ายคาบ (เอกสารออกแบบ ข้อ 17) — จำนวนรวมเท่านั้น ไม่มีชื่อ/ผลรายคน (จอครูมักขึ้นโปรเจกเตอร์)
export function FocusSummaryCard({ focusSessionId, onClose }: { focusSessionId: string; onClose: () => void }) {
  const s = useFocusLiveSummary(focusSessionId, null);
  if (!s || s.status !== "ended") return null;
  const minutes = s.ended_at
    ? Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000)
    : null;
  const avgMinutes = s.total > 0 ? Math.round(s.focused_seconds / s.total / 60) : 0;
  return (
    <div className="relative mt-4 rounded-2xl border border-gold-dim bg-card p-4 text-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute right-3 top-3 rounded-full p-1 text-text3 transition active:scale-90"
      >
        <X size={18} />
      </button>
      <p className="text-sm text-text2">สรุปคาบตั้งใจ{minutes !== null ? ` · ${minutes} นาที` : ""}</p>
      <p className="mt-1 text-3xl font-bold text-gold-hi">
        {s.focused_students}/{s.total} <span className="text-base font-normal text-text2">คน</span>
      </p>
      <p className="text-xs text-text3">ตั้งใจครบอย่างน้อย 1 รอบ 10 นาที</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="รอบ 10 นาทีรวม" value={s.completed_blocks} tone="text-gold-hi" />
        <Stat label="EXP ที่แจก" value={s.exp_awarded} tone="text-good" />
        <Stat label="นาทีเฉลี่ย/คน" value={avgMinutes} tone="text-text" />
      </div>
      {s.ended_reason === "stale_timeout" && (
        <p className="mt-3 text-xs text-text3">ระบบปิดคาบให้อัตโนมัติ เพราะไม่มีความเคลื่อนไหวเกิน 60 นาที</p>
      )}
    </div>
  );
}
