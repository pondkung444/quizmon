"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AvailableChapter = {
  chapter_key: string;
  subject: string;
  branch: string | null;
  chapter: string;
  chapter_order: number;
  question_count: number;
  is_available: boolean;
  recent_attempts: number;
  recent_accuracy: number | null;
  already_in_active_plan: boolean;
};

type PlanRow = {
  plan_id: string;
  framework: string;
  duration_weeks: number;
  exam_date: string | null;
  plan_status: string;
  plan_created_at: string;
  chapter_key: string | null;
  subject: string | null;
  branch: string | null;
  chapter: string | null;
  chapter_queue_order: number | null;
  chapter_status: string | null;
  entered_current_at: string | null;
  passed_at: string | null;
};

export default function PlanWizard({
  studentId,
  studentUsername,
}: {
  studentId: string;
  studentUsername: string;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [available, setAvailable] = useState<AvailableChapter[]>([]);

  // wizard form state
  const [framework, setFramework] = useState<"school" | "weak_spot" | "exam_prep">("school");
  const [durationWeeks, setDurationWeeks] = useState<4 | 8 | 12>(4);
  const [examDate, setExamDate] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);
    const [planRes, availRes] = await Promise.all([
      supabase.rpc("guardian_get_plan", { p_student_id: studentId }),
      supabase.rpc("guardian_get_available_chapters", { p_student_id: studentId }),
    ]);
    if (planRes.error) setError(planRes.error.message);
    if (availRes.error) setError((prev) => prev ?? availRes.error!.message);
    setPlan(planRes.data ?? []);
    setAvailable(availRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const hasActivePlan = plan.length > 0 && plan[0].plan_id;

  function toggleChapter(key: string) {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || selectedKeys.length === 0) return;
    setSubmitting(true);
    setError(null);

    const { error } = await supabase.rpc("guardian_create_plan", {
      p_student_id: studentId,
      p_framework: framework,
      p_duration_weeks: durationWeeks,
      p_chapter_keys: selectedKeys,
      p_exam_date: framework === "exam_prep" ? examDate || null : null,
    });

    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSelectedKeys([]);
    await loadAll();
  }

  async function moveChapter(index: number, direction: -1 | 1) {
    const editable = plan.filter((r) => r.chapter_status !== "passed");
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= editable.length) return;

    const reordered = [...editable];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const newOrderKeys = reordered.map((r) => r.chapter_key as string);

    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("guardian_set_plan_chapter_queue", {
      p_plan_id: plan[0].plan_id,
      p_chapter_keys: newOrderKeys,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    await loadAll();
  }

  async function removeChapter(chapterKey: string) {
    const editable = plan.filter((r) => r.chapter_status !== "passed" && r.chapter_key !== chapterKey);
    const newOrderKeys = editable.map((r) => r.chapter_key as string);
    if (newOrderKeys.length === 0) {
      setError("ต้องเหลืออย่างน้อย 1 บทเรียนในคิว");
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("guardian_set_plan_chapter_queue", {
      p_plan_id: plan[0].plan_id,
      p_chapter_keys: newOrderKeys,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    await loadAll();
  }

  async function advanceIfPassed() {
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase.rpc("guardian_advance_plan_if_passed", {
      p_student_id: studentId,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    alert(JSON.stringify(data));
    await loadAll();
  }

  if (loading) {
    return <p className="text-center text-sm text-text3">กำลังโหลด...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-text2">นักเรียน: {studentUsername}</p>

      {error && (
        <p className="rounded-md bg-red/10 p-2 text-center text-sm text-red">{error}</p>
      )}

      {hasActivePlan ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-gold-hi">
            แผนปัจจุบัน: {plan[0].framework} / {plan[0].duration_weeks} สัปดาห์
            {plan[0].exam_date ? ` / สอบ ${plan[0].exam_date}` : ""}
          </p>
          <p className="mt-1 text-xs text-text3">plan_id: {plan[0].plan_id}</p>

          <ul className="mt-3 flex flex-col gap-2">
            {plan
              .filter((r) => r.chapter_key)
              .map((row, i) => {
                const editable = plan.filter((r) => r.chapter_status !== "passed");
                const editableIndex = editable.findIndex((r) => r.chapter_key === row.chapter_key);
                return (
                  <li
                    key={row.chapter_key}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-track px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-text">
                        #{i + 1} {row.chapter} ({row.subject})
                      </p>
                      <p className="text-text3">status: {row.chapter_status}</p>
                    </div>
                    {row.chapter_status !== "passed" && (
                      <div className="flex gap-1">
                        <button
                          disabled={submitting}
                          onClick={() => moveChapter(editableIndex, -1)}
                          className="rounded bg-card px-2 py-1"
                        >
                          ↑
                        </button>
                        <button
                          disabled={submitting}
                          onClick={() => moveChapter(editableIndex, 1)}
                          className="rounded bg-card px-2 py-1"
                        >
                          ↓
                        </button>
                        <button
                          disabled={submitting}
                          onClick={() => removeChapter(row.chapter_key as string)}
                          className="rounded bg-card px-2 py-1 text-red"
                        >
                          ลบ
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>

          <button
            disabled={submitting}
            onClick={advanceIfPassed}
            className="mt-3 w-full rounded-full bg-gold-hi py-2 text-sm font-semibold text-track"
          >
            ทดสอบ guardian_advance_plan_if_passed (เรียกในนามนักเรียนเอง)
          </button>
        </div>
      ) : (
        <form onSubmit={handleCreatePlan} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div>
            <p className="mb-1 text-sm font-medium text-text2">Framework</p>
            <div className="flex gap-2">
              {(["school", "weak_spot", "exam_prep"] as const).map((f) => (
                <button
                  type="button"
                  key={f}
                  onClick={() => setFramework(f)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                    framework === f ? "border-gold-hi bg-gold-hi/20 text-gold-hi" : "border-border text-text3"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-text2">ระยะเวลา (สัปดาห์)</p>
            <div className="flex gap-2">
              {([4, 8, 12] as const).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDurationWeeks(d)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                    durationWeeks === d ? "border-gold-hi bg-gold-hi/20 text-gold-hi" : "border-border text-text3"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {framework === "exam_prep" && (
            <div>
              <p className="mb-1 text-sm font-medium text-text2">วันสอบ</p>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-md border border-border bg-track px-3 py-2 text-sm text-text"
              />
            </div>
          )}

          <div>
            <p className="mb-1 text-sm font-medium text-text2">
              เลือกบท (เรียงตามลำดับที่กด) — {selectedKeys.length} เลือกแล้ว
            </p>
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {available.map((ch) => {
                const order = selectedKeys.indexOf(ch.chapter_key);
                return (
                  <li key={ch.chapter_key}>
                    <label className="flex items-center gap-2 rounded-md border border-border bg-track px-2 py-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={order !== -1}
                        onChange={() => toggleChapter(ch.chapter_key)}
                        disabled={!ch.is_available}
                      />
                      <span className={ch.is_available ? "text-text" : "text-text3 line-through"}>
                        {order !== -1 ? `#${order + 1} ` : ""}
                        {ch.subject} / {ch.chapter} ({ch.question_count} ข้อ
                        {ch.recent_accuracy !== null ? `, acc ${ch.recent_accuracy}%` : ""})
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <button
            type="submit"
            disabled={submitting || selectedKeys.length === 0}
            className="rounded-full py-2.5 font-semibold text-track transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
          >
            {submitting ? "กำลังสร้าง..." : "สร้างแผน"}
          </button>
        </form>
      )}
    </div>
  );
}
