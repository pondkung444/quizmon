"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatElapsed, useElapsedSeconds } from "@/lib/classroom/useFocusSession";

// แผงครูระหว่างคาบตั้งใจ — โชว์จำนวนรวมเท่านั้น ไม่โชว์ชื่อ/ผลรายคน
// จำนวนสดมาจาก get_focus_live_summary (server ประเมินคนที่เงียบไปก่อนนับ ไม่ค้างเป็น "ตั้งใจอยู่")

const LIVE_POLL_MS = 15_000;

type LiveSummary = { total: number; focusing: number; warning: number; away: number; completed_blocks: number };

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
  const live = useFocusLiveSummary(focusSessionId);
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

function useFocusLiveSummary(focusSessionId: string): LiveSummary | null {
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
    const id = setInterval(load, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [focusSessionId, supabase]);
  return summary;
}
