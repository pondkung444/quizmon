"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type GoalProgress = {
  week_start: string;
  has_goal: boolean;
  level: string | null;
  bucket: string | null;
};

const LEVELS = [
  { level: "relaxed" as const, label: "สบายๆ" },
  { level: "steady" as const, label: "กำลังดี" },
  { level: "challenging" as const, label: "ท้าทาย" },
];

export default function GoalPanel({
  studentId,
  studentUsername,
}: {
  studentId: string;
  studentUsername: string;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastSetResult, setLastSetResult] = useState<{
    week_start: string;
    level: string;
    computed_target: number;
  } | null>(null);

  async function loadProgress() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("guardian_get_goal_progress", {
      p_student_id: studentId,
    });
    if (error) {
      setError(error.message);
    } else {
      setProgress(data?.[0] ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function handleSetLevel(level: "relaxed" | "steady" | "challenging") {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase.rpc("guardian_set_goal", {
      p_student_id: studentId,
      p_level: level,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLastSetResult(data?.[0] ?? null);
    await loadProgress();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-text2">นักเรียน: {studentUsername}</p>

      {error && (
        <p className="rounded-md bg-red/10 p-2 text-center text-sm text-red">{error}</p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-gold-hi">
          {loading ? "กำลังโหลด..." : progress?.has_goal ? "สถานะสัปดาห์นี้" : "ยังไม่ได้ตั้งเป้าหมายสัปดาห์นี้"}
        </p>
        {progress?.has_goal && (
          <>
            <p className="mt-2 text-2xl font-bold text-text">{progress.bucket}</p>
            <p className="mt-1 text-xs text-text3">
              level ที่ตั้งไว้: {progress.level} (ผู้ปกครองเห็นแค่ band นี้ ไม่เห็นตัวเลขจริง — ตาม spec)
            </p>
          </>
        )}
        <p className="mt-2 text-xs text-text3">week_start: {progress?.week_start}</p>
      </div>

      <div className="flex gap-2">
        {LEVELS.map(({ level, label }) => (
          <button
            key={level}
            disabled={submitting}
            onClick={() => handleSetLevel(level)}
            className="flex-1 rounded-full border border-gold-hi py-2.5 text-sm font-semibold text-gold-hi transition hover:bg-gold-hi/10 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      {lastSetResult && (
        <div className="rounded-xl border border-border bg-card p-3 text-xs text-text3">
          <p className="font-semibold text-text2">
            ผลจาก guardian_set_goal (สำหรับ debug เท่านั้น — เด็กเห็นตัวเลขนี้ได้ ผู้ปกครองไม่ควรเห็น
            ในดีไซน์จริง):
          </p>
          <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(lastSetResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
