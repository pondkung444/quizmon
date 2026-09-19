"use client";

import { useEffect, useState } from "react";
import {
  Check,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  School,
  Target,
  CalendarClock,
  CircleCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/social/BottomSheet";
import { accuracyTextClass } from "../overview/shared";

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
  chapter_status: "pending" | "current" | "passed" | "stuck" | null;
  entered_current_at: string | null;
  passed_at: string | null;
};

// สเปกล็อกที่ §5.2: "Framework สำเร็จรูป 3 แบบ (เลือกรูปแบบ ไม่ใช่เลือกบท)"
const FRAMEWORKS = [
  {
    value: "school" as const,
    label: "ตามที่โรงเรียนสอน",
    description: "เรียงตามลำดับที่โรงเรียนกำลังสอน — ตัวเลือกปลอดภัย เหมาะกับเด็กทั่วไป",
    Icon: School,
    badge: "แนะนำ",
  },
  {
    value: "weak_spot" as const,
    label: "ซ่อมจุดอ่อน",
    description: "เรียงจากบทที่ลูกยังทำได้ไม่ดี ใช้ข้อมูลการตอบจริงช่วยจัดลำดับ",
    Icon: Target,
    badge: null,
  },
  {
    value: "exam_prep" as const,
    label: "เตรียมสอบ",
    description: "บอกวันสอบ ระบบกระจายบทให้เรียนจบทันก่อนวันนั้น",
    Icon: CalendarClock,
    badge: null,
  },
];

// เป้าความสม่ำเสมอ — ชุดเดียวกับหน้า /guardian/goal (RPC guardian_set_goal ตัวเดียวกัน) แค่ต่อ UX
// จากตรงนี้ให้ครบ 3 คำถามตาม §5.2 (ตัดสินใจร่วมกับปอนด์ 2026-09-16: คนละ RPC เหมือนเดิม
// data model แยกกันตาม §5.7 แค่ต่อ flow ให้ลื่นในหน้าเดียว)
const GOAL_LEVELS = [
  { level: "relaxed" as const, label: "สบายๆ", description: "พอๆ กับที่ลูกเล่นเป็นปกติอยู่แล้ว" },
  { level: "steady" as const, label: "กำลังดี", description: "มากกว่าปกติหน่อย ให้ลูกได้ฝึกเพิ่ม" },
  { level: "challenging" as const, label: "ท้าทาย", description: "เต็มที่ เหมาะกับสัปดาห์ที่ลูกพร้อม" },
];

const CHAPTER_STATUS_LABEL: Record<string, { label: string; note?: string }> = {
  pending: { label: "รอคิว" },
  current: { label: "กำลังเรียนอยู่" },
  passed: { label: "ผ่านแล้ว" },
  stuck: { label: "ค้างอยู่นาน", note: "อาจลองให้ครูช่วยดูจุดนี้เพิ่มได้" },
};

// จัดกลุ่มบทตามวิชา — ไม่ hardcode ปิดตายแค่คณิต/วิทย์ วิชาใหม่ในอนาคตที่ไม่อยู่ใน map
// จะ fallback ไปโชว์ชื่อดิบจาก DB แทน (ยังจัดกลุ่มได้ ไม่พังแค่ label ไม่สวย)
// ใช้ branch ก่อน subject เพราะ senior ฟิสิกส์เก็บเป็น subject='math' (gotcha ที่ล็อกไว้ในระบบ —
// ห้าม filter/label senior ด้วย subject ตรงๆ ต้องเช็ค branch ก่อนเสมอ)
const SUBJECT_LABEL: Record<string, string> = { math: "คณิตศาสตร์", science: "วิทยาศาสตร์" };
const BRANCH_LABEL: Record<string, string> = { physics: "ฟิสิกส์", chemistry: "เคมี", biology: "ชีววิทยา" };

function subjectGroupLabel(subject: string | null, branch: string | null): string {
  if (branch) return BRANCH_LABEL[branch] ?? branch;
  if (subject) return SUBJECT_LABEL[subject] ?? subject;
  return "อื่นๆ";
}

// น้อยกว่านี้ถือว่าข้อมูลไม่พอ — ไม่โชว์ % เพราะ 0%/2 ข้อ จะทำให้เข้าใจผิดว่าอ่อนจริง
// (เกณฑ์เดียวกับ "เทียบวิชา" ในภาพรวมที่ต้องตอบอย่างน้อย 10 ข้อ)
const MIN_ATTEMPTS_FOR_ACCURACY = 10;

function ChapterList({
  chapters,
  selectedKeys,
  onToggle,
  excludeKeys,
  passedKeys,
}: {
  chapters: AvailableChapter[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  excludeKeys?: string[];
  passedKeys?: string[];
}) {
  const visible = chapters.filter((c) => !excludeKeys?.includes(c.chapter_key));

  const groups = new Map<string, AvailableChapter[]>();
  for (const ch of visible) {
    const key = subjectGroupLabel(ch.subject, ch.branch);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }

  return (
    <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
      {[...groups.entries()].map(([groupName, items]) => (
        <div key={groupName}>
          <p className="mb-2 px-1 text-sm font-bold text-text3">{groupName}</p>
          <ul className="flex flex-col gap-2">
            {items.map((ch) => {
              const order = selectedKeys.indexOf(ch.chapter_key);
              const isSelected = order !== -1;
              const wasPassed = passedKeys?.includes(ch.chapter_key) ?? false;
              const enoughData = ch.recent_accuracy !== null && ch.recent_attempts >= MIN_ATTEMPTS_FOR_ACCURACY;
              return (
                <li key={ch.chapter_key}>
                  <button
                    type="button"
                    disabled={!ch.is_available}
                    onClick={() => onToggle(ch.chapter_key)}
                    className={`flex w-full min-h-[56px] items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition active:scale-[0.98] disabled:opacity-40 ${
                      isSelected ? "border-gold-hi bg-gold-hi/10" : "border-border bg-card"
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 text-xs font-bold ${
                        isSelected ? "border-gold-hi bg-gold-hi text-track" : "border-text3 text-text3"
                      }`}
                    >
                      {isSelected ? order + 1 : ""}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-text">{ch.chapter}</p>
                      <p className="text-sm text-text3">
                        {enoughData ? (
                          <>
                            30 วันล่าสุด ทำ {ch.recent_attempts} ข้อ · ถูก{" "}
                            <span className={`font-semibold ${accuracyTextClass(ch.recent_accuracy as number)}`}>
                              {ch.recent_accuracy}%
                            </span>
                          </>
                        ) : ch.recent_attempts > 0 ? (
                          `ทำไป ${ch.recent_attempts} ข้อ · ยังไม่มีข้อมูลเพียงพอ`
                        ) : (
                          "ยังไม่มีข้อมูลเพียงพอ"
                        )}
                        {` · คลัง ${ch.question_count} ข้อ`}
                      </p>
                      {wasPassed && (
                        <p className="mt-0.5 text-xs font-semibold text-emerald-400">
                          ✓ ผ่านแล้วในแผนเดิม — ไม่ต้องทำซ้ำ
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

type PlanGroup = { label: string; rows: PlanRow[] };

// จัดกลุ่มคิวตามวิชา (label เดียวกับตัวเลือกบท) — backend ให้ current ได้ 1 บทต่อวิชา ฉะนั้นแต่ละกลุ่ม
// มี "กำลังเรียนอยู่" ของตัวเอง ในกลุ่ม: บทที่ผ่านแล้วขึ้นก่อน (เป็นประวัติ) ตามด้วยคิวที่เหลือตาม queue_order
function groupPlan(rows: PlanRow[]): PlanGroup[] {
  const map = new Map<string, PlanRow[]>();
  for (const r of rows) {
    if (!r.chapter_key) continue;
    const label = subjectGroupLabel(r.subject, r.branch);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(r);
  }
  return [...map.entries()].map(([label, items]) => ({
    label,
    rows: items.sort((a, b) => {
      const pa = a.chapter_status === "passed" ? 0 : 1;
      const pb = b.chapter_status === "passed" ? 0 : 1;
      return pa - pb || (a.chapter_queue_order ?? 0) - (b.chapter_queue_order ?? 0);
    }),
  }));
}

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
  const [submitting, setSubmitting] = useState(false);

  // wizard step: 1 framework, 2 ระยะเวลา(+วันสอบ), 3 เลือกบท, 4 เป้าความสม่ำเสมอ
  const [step, setStep] = useState(1);
  const [framework, setFramework] = useState<"school" | "weak_spot" | "exam_prep">("school");
  const [durationWeeks, setDurationWeeks] = useState<4 | 8 | 12>(4);
  const [examDate, setExamDate] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [justCreatedPlan, setJustCreatedPlan] = useState(false);
  const [justSetGoalLabel, setJustSetGoalLabel] = useState<string | null>(null);

  // เพิ่มบทเข้าคิวที่มีอยู่แล้ว
  const [addingChapters, setAddingChapters] = useState(false);
  const [addKeys, setAddKeys] = useState<string[]>([]);

  // เปลี่ยนโหมด/สร้างแผนใหม่ทับแผนเดิม: confirm dialog -> wizard (เริ่มด้วยบทเดิมที่เลือกไว้ให้)
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [replacing, setReplacing] = useState(false);

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

  const hasActivePlan = plan.length > 0 && !!plan[0].plan_id;

  function toggleChapter(key: string) {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function toggleAddChapter(key: string) {
    setAddKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleCreatePlan() {
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
    setJustCreatedPlan(true);
    setStep(4);
    await loadAll();
  }

  async function handleSetGoal(level: "relaxed" | "steady" | "challenging", label: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("guardian_set_goal", { p_student_id: studentId, p_level: level });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setJustSetGoalLabel(label);
  }

  function finishWizard() {
    setStep(1);
    setSelectedKeys([]);
    setJustCreatedPlan(false);
    setJustSetGoalLabel(null);
    setReplacing(false);
  }

  // เริ่ม wizard สร้างแผนใหม่ — เลือกบทเดิมทั้งหมด (รวมที่ผ่านแล้ว) ไว้ให้ก่อน ผู้ปกครองแค่เพิ่ม/ลด
  // บทที่ผ่านแล้วที่ถูกเลือกซ้ำ backend จะ carry เป็น "ผ่านแล้ว" ให้ ไม่ต้องทำซ้ำ
  function startReplace() {
    const groups = groupPlan(plan);
    setSelectedKeys(groups.flatMap((g) => g.rows.map((r) => r.chapter_key as string)));
    setFramework(plan[0].framework as "school" | "weak_spot" | "exam_prep");
    setDurationWeeks(plan[0].duration_weeks as 4 | 8 | 12);
    setExamDate(plan[0].exam_date ?? "");
    setStep(1);
    setConfirmingReplace(false);
    setReplacing(true);
  }

  // คิวที่ไม่ผ่านแล้ว เรียงเป็นกลุ่มต่อกัน (ตามลำดับกลุ่ม) — backend เรียง queue_order ใหม่แยกต่อวิชาจาก
  // ลำดับที่ส่งไป ฉะนั้นสลับตำแหน่งภายในกลุ่มเดียวกันก็พอ
  function editableKeys(groups: PlanGroup[]): string[] {
    return groups.flatMap((g) => g.rows.filter((r) => r.chapter_status !== "passed").map((r) => r.chapter_key as string));
  }

  async function moveChapter(groupLabel: string, chapterKey: string, direction: -1 | 1) {
    const groups = groupPlan(plan);
    const group = groups.find((g) => g.label === groupLabel);
    if (!group) return;
    const items = group.rows.filter((r) => r.chapter_status !== "passed");
    const index = items.findIndex((r) => r.chapter_key === chapterKey);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;

    [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
    group.rows = [...group.rows.filter((r) => r.chapter_status === "passed"), ...items];
    const newOrderKeys = editableKeys(groups);

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
    const newOrderKeys = editableKeys(groupPlan(plan)).filter((k) => k !== chapterKey);
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

  async function confirmAddChapters() {
    if (submitting || addKeys.length === 0) return;
    const existingKeys = editableKeys(groupPlan(plan));

    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("guardian_set_plan_chapter_queue", {
      p_plan_id: plan[0].plan_id,
      p_chapter_keys: [...existingKeys, ...addKeys],
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAddingChapters(false);
    setAddKeys([]);
    await loadAll();
  }

  if (loading) {
    return <p className="text-center text-base text-text3">กำลังโหลด...</p>;
  }

  const framework0 = FRAMEWORKS.find((f) => f.value === framework)!;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-base text-text2">
        แผนฝึกของ <span className="font-semibold text-text">{studentUsername}</span>
      </p>

      {error && <p className="rounded-xl bg-red/10 p-3 text-center text-base text-red">{error}</p>}

      {hasActivePlan && !justCreatedPlan && !replacing ? (
        <>
          {(() => {
            const groups = groupPlan(plan);
            const allRows = groups.flatMap((g) => g.rows);
            const total = allRows.length;
            const passedCount = allRows.filter((r) => r.chapter_status === "passed").length;
            return (
              <>
                <div className="gd-card p-5">
                  <div className="flex items-center gap-3">
                    <framework0.Icon className="h-8 w-8 flex-none text-gold-hi" />
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold text-text">{framework0.label}</p>
                      <p className="text-sm text-text3">
                        {plan[0].duration_weeks} สัปดาห์
                        {plan[0].exam_date ? ` · สอบวันที่ ${plan[0].exam_date}` : ""}
                      </p>
                    </div>
                  </div>
                  {total > 0 && (
                    <p className="mt-3 text-base font-semibold text-gold-hi">
                      ผ่านแล้ว {passedCount} จาก {total} บท
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmingReplace(true)}
                    className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-border text-base font-semibold text-text2 transition active:scale-[0.98]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    เปลี่ยนโหมด / สร้างแผนใหม่
                  </button>
                </div>

                <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
                  {groups.map((group) => {
                    const passedInGroup = group.rows.filter((r) => r.chapter_status === "passed").length;
                    const editable = group.rows.filter((r) => r.chapter_status !== "passed");
                    const hasCurrent = group.rows.some((r) => r.chapter_status === "current");
                    const allPassed = editable.length === 0;
                    return (
                      <section key={group.label} className="gd-card p-4">
                        <div className="mb-3 flex items-baseline justify-between gap-2">
                          <h2 className="text-base font-bold text-mint">{group.label}</h2>
                          <span className="text-xs text-text3">
                            ผ่านแล้ว {passedInGroup}/{group.rows.length} บท
                          </span>
                        </div>

                        {allPassed && (
                          <p className="mb-2 flex items-center gap-2 rounded-xl bg-good/15 px-3 py-2 text-sm font-semibold text-good">
                            <CircleCheck className="h-5 w-5 flex-none" />
                            จบวิชานี้ในแผนนี้แล้ว
                          </p>
                        )}
                        {!allPassed && !hasCurrent && (
                          <p className="mb-2 text-xs text-text3">ยังไม่มีบทที่กำลังเรียนอยู่ในวิชานี้</p>
                        )}

                        <ul className="flex flex-col gap-2">
                          {group.rows.map((row) => {
                            const statusInfo = CHAPTER_STATUS_LABEL[row.chapter_status ?? "pending"];
                            const editableIndex = editable.findIndex((r) => r.chapter_key === row.chapter_key);
                            const isPassed = row.chapter_status === "passed";
                            const isCurrent = row.chapter_status === "current";
                            const isStuck = row.chapter_status === "stuck";
                            return (
                              <li
                                key={row.chapter_key}
                                className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 ${
                                  isCurrent
                                    ? "border-gold-hi bg-gold-hi/10"
                                    : isPassed
                                      ? "border-border bg-track opacity-60"
                                      : isStuck
                                        ? "border-amber bg-amber/10"
                                        : "border-border bg-track"
                                }`}
                              >
                                {isPassed ? (
                                  <CircleCheck className="h-6 w-6 flex-none text-emerald-400" />
                                ) : isStuck ? (
                                  <AlertTriangle className="h-6 w-6 flex-none text-amber" />
                                ) : (
                                  <div className="flex h-6 w-6 flex-none items-center justify-center text-sm font-bold text-text3">
                                    {isCurrent ? "🔥" : editableIndex + 1}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-semibold text-text">{row.chapter}</p>
                                  <p className={`text-sm ${isCurrent ? "font-semibold text-gold-hi" : "text-text3"}`}>
                                    {isCurrent ? `กำลังเรียนอยู่ (${group.label})` : statusInfo.label}
                                    {statusInfo.note ? ` — ${statusInfo.note}` : ""}
                                  </p>
                                </div>
                                {!isPassed && (
                                  <div className="flex flex-none gap-1">
                                    <button
                                      type="button"
                                      disabled={submitting || editableIndex <= 0}
                                      onClick={() => moveChapter(group.label, row.chapter_key as string, -1)}
                                      aria-label="เลื่อนขึ้น"
                                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text2 disabled:opacity-30"
                                    >
                                      <ChevronUp className="h-5 w-5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={submitting || editableIndex >= editable.length - 1}
                                      onClick={() => moveChapter(group.label, row.chapter_key as string, 1)}
                                      aria-label="เลื่อนลง"
                                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text2 disabled:opacity-30"
                                    >
                                      <ChevronDown className="h-5 w-5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={submitting}
                                      onClick={() => removeChapter(row.chapter_key as string)}
                                      aria-label="ลบบทนี้"
                                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-red/40 text-red"
                                    >
                                      <Trash2 className="h-5 w-5" />
                                    </button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    );
                  })}
                </div>

                {addingChapters ? (
                  <div className="gd-card flex flex-col gap-3 p-4">
                    <p className="text-base font-semibold text-text2">
                      เพิ่มบทเข้าคิว — เลือกแล้ว {addKeys.length}
                    </p>
                    <ChapterList
                      chapters={available}
                      selectedKeys={addKeys}
                      onToggle={toggleAddChapter}
                      excludeKeys={allRows.map((c) => c.chapter_key as string)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingChapters(false);
                          setAddKeys([]);
                        }}
                        className="flex-1 rounded-full border border-border py-2.5 text-base font-semibold text-text2"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        disabled={submitting || addKeys.length === 0}
                        onClick={confirmAddChapters}
                        className="flex-1 rounded-full bg-gold-hi py-2.5 text-base font-bold text-track disabled:opacity-50"
                      >
                        {submitting ? "กำลังเพิ่ม..." : "เพิ่มเข้าคิว"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingChapters(true)}
                    className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gold-dim text-base font-semibold text-text2 transition active:scale-[0.98]"
                  >
                    <Plus className="h-5 w-5" />
                    เพิ่มบทเข้าคิว
                  </button>
                )}

                {confirmingReplace && (
                  <BottomSheet title="เปลี่ยนโหมด / สร้างแผนใหม่" onClose={() => setConfirmingReplace(false)}>
                    <div className="flex flex-col gap-3 p-4">
                      <p className="text-base text-text">
                        บทที่ลูกผ่านไปแล้ว <span className="font-bold text-emerald-400">จะไม่ต้องทำซ้ำ</span>{" "}
                        ถ้าเลือกบทเดิมในแผนใหม่ ระบบจะนับให้ว่าผ่านแล้วทันที
                      </p>
                      <p className="text-sm text-text3">
                        เราเลือกบทเดิมของแผนนี้ไว้ให้ก่อน คุณเปลี่ยนโหมด ระยะเวลา และเพิ่ม/ลดบทได้ในขั้นถัดไป
                        ความคืบหน้าของบทที่ไม่ได้เลือกซ้ำจะไม่ถูกนับในแผนใหม่
                      </p>
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmingReplace(false)}
                          className="flex-1 rounded-full border border-border py-3 text-base font-semibold text-text2"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={startReplace}
                          className="flex-1 rounded-full bg-gold-hi py-3 text-base font-bold text-track"
                        >
                          ไปต่อ
                        </button>
                      </div>
                    </div>
                  </BottomSheet>
                )}
              </>
            );
          })()}
        </>
      ) : (
        <>
          {/* ตัวชี้ขั้นตอน — เรียบง่าย ไม่มีตัวเลข % หรือศัพท์เทคนิค */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full ${s <= step ? "bg-gold-hi" : "bg-border"}`}
              />
            ))}
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-3">
              <p className="text-lg font-bold text-text">เน้นอะไรดี</p>
              {FRAMEWORKS.map(({ value, label, description, Icon, badge }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFramework(value)}
                  className={`flex items-start gap-3 rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.98] ${
                    framework === value ? "border-gold-hi bg-gold-hi/10" : "border-border bg-card"
                  }`}
                >
                  <Icon className={`mt-0.5 h-7 w-7 flex-none ${framework === value ? "text-gold-hi" : "text-text3"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-lg font-bold ${framework === value ? "text-gold-hi" : "text-text"}`}>{label}</p>
                      {badge && (
                        <span className="rounded-full bg-gold-hi/20 px-2 py-0.5 text-xs font-bold text-gold-hi">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-text3">{description}</p>
                  </div>
                  {framework === value && <Check className="mt-1 h-6 w-6 flex-none text-gold-hi" />}
                </button>
              ))}
              <div className="mt-2 flex gap-2">
                {replacing && (
                  <button
                    type="button"
                    onClick={finishWizard}
                    className="flex-1 rounded-full border border-border py-3 text-base font-semibold text-text2"
                  >
                    ยกเลิก
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-full py-3 text-base font-bold text-track"
                  style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <p className="text-lg font-bold text-text">ยาวแค่ไหนดี</p>
              <div className="flex gap-3">
                {([4, 8, 12] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationWeeks(d)}
                    className={`flex-1 rounded-2xl border-2 py-5 text-center transition active:scale-[0.98] ${
                      durationWeeks === d ? "border-gold-hi bg-gold-hi/10" : "border-border bg-card"
                    }`}
                  >
                    <p className={`text-2xl font-extrabold ${durationWeeks === d ? "text-gold-hi" : "text-text"}`}>{d}</p>
                    <p className="text-sm text-text3">สัปดาห์</p>
                  </button>
                ))}
              </div>

              {framework === "exam_prep" && (
                <div>
                  <p className="mb-1 text-base font-medium text-text2">วันสอบ</p>
                  <input
                    type="date"
                    min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full rounded-xl border border-border bg-track px-4 py-3 text-base text-text"
                  />
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-full border border-border py-3 text-base font-semibold text-text2"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={framework === "exam_prep" && !examDate}
                  onClick={() => setStep(3)}
                  className="flex-1 rounded-full py-3 text-base font-bold text-track disabled:opacity-50"
                  style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <p className="text-lg font-bold text-text">เลือกบท — {selectedKeys.length} บทที่เลือก</p>
              {replacing && (
                <p className="-mt-1 text-sm text-text3">
                  บทที่ติ๊ก ✓ ผ่านแล้วจะนับเป็นผ่านให้ทันทีในแผนใหม่ ไม่ต้องทำซ้ำ
                </p>
              )}
              <ChapterList
                chapters={available}
                selectedKeys={selectedKeys}
                onToggle={toggleChapter}
                passedKeys={plan.filter((r) => r.chapter_status === "passed").map((r) => r.chapter_key as string)}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-full border border-border py-3 text-base font-semibold text-text2"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={submitting || selectedKeys.length === 0}
                  onClick={handleCreatePlan}
                  className="flex-1 rounded-full py-3 text-base font-bold text-track disabled:opacity-50"
                  style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
                >
                  {submitting ? "กำลังสร้าง..." : "สร้างแผน"}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3">
              {justCreatedPlan && (
                <p className="text-center text-base text-emerald-400">สร้างแผนเรียบร้อยแล้ว</p>
              )}
              <p className="text-lg font-bold text-text">อยากให้ลูกฝึกสม่ำเสมอแค่ไหน</p>
              <p className="-mt-2 text-sm text-text3">ตั้งเป้าประจำสัปดาห์ควบคู่ไปด้วยได้ (ไม่ตั้งตอนนี้ก็ได้)</p>
              {GOAL_LEVELS.map(({ level, label, description }) => (
                <button
                  key={level}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSetGoal(level, label)}
                  className={`flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                    justSetGoalLabel === label ? "border-gold-hi bg-gold-hi/10" : "border-border bg-card"
                  }`}
                >
                  <div>
                    <p className={`text-lg font-bold ${justSetGoalLabel === label ? "text-gold-hi" : "text-text"}`}>{label}</p>
                    <p className="mt-0.5 text-sm text-text3">{description}</p>
                  </div>
                  {justSetGoalLabel === label && <Check className="h-6 w-6 flex-none text-gold-hi" />}
                </button>
              ))}
              {justSetGoalLabel && (
                <p className="text-center text-base text-text2">
                  ตั้งเป้า <span className="font-semibold text-gold-hi">{justSetGoalLabel}</span> เรียบร้อยแล้ว
                </p>
              )}
              <button
                type="button"
                onClick={finishWizard}
                className="mt-2 rounded-full border border-gold-dim py-3 text-base font-semibold text-text2"
              >
                {justSetGoalLabel ? "เสร็จสิ้น" : "ข้ามขั้นตอนนี้"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
