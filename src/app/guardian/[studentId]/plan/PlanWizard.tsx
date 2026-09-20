"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Plus,
  School,
  Target,
  CalendarClock,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/social/BottomSheet";
import type { ViewerMode } from "@/components/guardian/viewerMode";
import { accuracyTextClass, gradeLabel } from "../overview/shared";
import PlanTimeline, { PlanTimelineLegend } from "@/components/guardian/PlanTimeline";
import PlanKanban from "@/components/guardian/PlanKanban";
import {
  buildWeeks,
  bufferSummary,
  checkFit,
  examInfo,
  placeChapters,
  previewChapters,
  reorderForDrop,
  type ScheduleChapter,
  STRENGTH_LABEL,
  strengthOf,
  toBkkYmd,
} from "@/lib/planSchedule";

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
  grade_level: string | null;
  grade_order: number;
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

// viewerMode="self": copy บุรุษที่ 1 (นักเรียนอ่านเอง) — ที่เหลือของแต่ละรายการเหมือนเดิม
const FRAMEWORKS_SELF = FRAMEWORKS.map((f) =>
  f.value === "school"
    ? { ...f, description: "เรียงตามลำดับที่โรงเรียนกำลังสอน — ตัวเลือกปลอดภัย เหมาะกับทุกคน" }
    : f.value === "weak_spot"
      ? { ...f, description: "เรียงจากบทที่คุณยังทำได้ไม่ดี ใช้ข้อมูลการตอบจริงช่วยจัดลำดับ" }
      : f
);

const GOAL_LEVELS_SELF = [
  { ...GOAL_LEVELS[0], description: "พอๆ กับที่เล่นเป็นปกติอยู่แล้ว" },
  { ...GOAL_LEVELS[1], description: "มากกว่าปกติหน่อย ได้ฝึกเพิ่ม" },
  { ...GOAL_LEVELS[2], description: "เต็มที่ เหมาะกับสัปดาห์ที่พร้อม" },
];

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

// tier เดียวกับ guardian_get_categories: >=80 = "คล่องแล้ว" — บทที่ "ยังต้องฝึก" คือทุกบทที่ไม่ใช่คล่องแล้ว
// รวมบทที่ข้อมูลยังไม่พอ (ยังไม่รู้ว่าคล่องหรือยัง จึงไม่ตัดทิ้ง)
function hasEnoughData(ch: AvailableChapter): boolean {
  return ch.recent_accuracy !== null && ch.recent_attempts >= MIN_ATTEMPTS_FOR_ACCURACY;
}
function needsPractice(ch: AvailableChapter): boolean {
  return !(hasEnoughData(ch) && (ch.recent_accuracy as number) >= 80);
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[36px] shrink-0 rounded-full border px-3 text-sm font-semibold transition ${
        active ? "border-gold-hi bg-gold-hi/15 text-gold-hi" : "border-border bg-track text-text2"
      }`}
    >
      {children}
    </button>
  );
}

function ChapterList({
  chapters,
  selectedKeys,
  onToggle,
  excludeKeys,
  passedKeys,
  filterable = false,
}: {
  chapters: AvailableChapter[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  excludeKeys?: string[];
  passedKeys?: string[];
  filterable?: boolean;
}) {
  // ตัวกรอง 3 ตัวใช้ร่วมกันแบบ AND (ไม่ exclusive)
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [onlyNeedsPractice, setOnlyNeedsPractice] = useState(false);

  const base = chapters.filter((c) => !excludeKeys?.includes(c.chapter_key));

  const subjectOptions = [...new Set(base.map((c) => subjectGroupLabel(c.subject, c.branch)))];
  const gradeOptions = [...new Map(base.map((c) => [gradeLabel(c.grade_level), c.grade_order])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);

  const visible = filterable
    ? base.filter(
        (c) =>
          (!subjectFilter || subjectGroupLabel(c.subject, c.branch) === subjectFilter) &&
          (!gradeFilter || gradeLabel(c.grade_level) === gradeFilter) &&
          (!onlyNeedsPractice || needsPractice(c))
      )
    : base;

  const groups = new Map<string, AvailableChapter[]>();
  for (const ch of visible) {
    const key = subjectGroupLabel(ch.subject, ch.branch);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }

  return (
    <div className="flex flex-col gap-3">
      {filterable && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterChip active={!subjectFilter} onClick={() => setSubjectFilter(null)}>
              ทุกวิชา
            </FilterChip>
            {subjectOptions.map((s) => (
              <FilterChip key={s} active={subjectFilter === s} onClick={() => setSubjectFilter(subjectFilter === s ? null : s)}>
                {s}
              </FilterChip>
            ))}
          </div>
          {gradeOptions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <FilterChip active={!gradeFilter} onClick={() => setGradeFilter(null)}>
                ทุกระดับชั้น
              </FilterChip>
              {gradeOptions.map((g) => (
                <FilterChip key={g} active={gradeFilter === g} onClick={() => setGradeFilter(gradeFilter === g ? null : g)}>
                  {g}
                </FilterChip>
              ))}
            </div>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={onlyNeedsPractice}
            onClick={() => setOnlyNeedsPractice((v) => !v)}
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-track px-3 text-left"
          >
            <span className="text-sm font-semibold text-text2">เฉพาะบทที่ยังต้องฝึกเพิ่ม</span>
            <span
              className={`flex h-6 w-11 flex-none items-center rounded-full p-0.5 transition ${
                onlyNeedsPractice ? "bg-gold-hi" : "bg-border"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white transition-transform ${onlyNeedsPractice ? "translate-x-5" : ""}`}
              />
            </span>
          </button>
          <p className="text-xs text-text3">
            แสดง {visible.length} จาก {base.length} บท
            {onlyNeedsPractice ? " · รวมบทที่ยังไม่มีข้อมูลเพียงพอ" : ""}
          </p>
        </div>
      )}
      {filterable && visible.length === 0 && (
        <p className="rounded-xl bg-track p-3 text-center text-sm text-text3">ไม่มีบทที่ตรงกับตัวกรองที่เลือก</p>
      )}
      <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
      {[...groups.entries()].map(([groupName, items]) => (
        <div key={groupName}>
          <p
            className={`mb-2 flex items-center gap-2 border-b border-border px-1 pb-1 text-sm font-bold ${
              items[0].subject === "science" ? "text-sci-hi" : "text-indigo-hi"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${items[0].subject === "science" ? "bg-sci" : "bg-indigo"}`} />
            {groupName}
            <span className="text-xs font-normal text-text3">
              · เลือกแล้ว {items.filter((c) => selectedKeys.includes(c.chapter_key)).length}/{items.length}
            </span>
          </p>
          <ul className="flex flex-col gap-2">
            {items.map((ch) => {
              const order = selectedKeys.indexOf(ch.chapter_key);
              const isSelected = order !== -1;
              const wasPassed = passedKeys?.includes(ch.chapter_key) ?? false;
              const enoughData = ch.recent_accuracy !== null && ch.recent_attempts >= MIN_ATTEMPTS_FOR_ACCURACY;
              const strength = strengthOf(ch.recent_accuracy, ch.recent_attempts, MIN_ATTEMPTS_FOR_ACCURACY);
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
                      <p className="text-sm">
                        <span className={`font-semibold ${strength === "unknown" ? "text-text3" : accuracyTextClass(ch.recent_accuracy as number)}`}>
                          {STRENGTH_LABEL[strength]}
                        </span>
                      </p>
                      <p className="text-xs text-text3">
                        {enoughData
                          ? `30 วันล่าสุด ทำ ${ch.recent_attempts} ข้อ · ถูก ${ch.recent_accuracy}%`
                          : ch.recent_attempts > 0
                            ? `ทำไป ${ch.recent_attempts} ข้อ (น้อยกว่า ${MIN_ATTEMPTS_FOR_ACCURACY} ข้อ)`
                            : "ยังไม่เคยทำ"}
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
    </div>
  );
}

function toScheduleChapters(rows: PlanRow[]): ScheduleChapter[] {
  return rows
    .filter((r) => r.chapter_key && r.subject && r.chapter && r.chapter_status)
    .map((r) => ({
      chapter_key: r.chapter_key as string,
      subject: r.subject as string,
      branch: r.branch,
      chapter: r.chapter as string,
      queue_order: r.chapter_queue_order ?? 0,
      status: r.chapter_status as ScheduleChapter["status"],
      entered_current_at: r.entered_current_at,
      passed_at: r.passed_at,
    }));
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

// ขั้น 2: ตัวอย่างสัปดาห์ของแผน (อัปเดตทันทีเมื่อเปลี่ยนระยะเวลา/วันสอบ) — วันที่นับ rolling จากวันนี้
function PlanCalendarPreview({ durationWeeks, examDate }: { durationWeeks: number; examDate: string }) {
  const today = toBkkYmd(new Date());
  const weeks = buildWeeks(today, durationWeeks, today);
  const exam = examDate ? examInfo(today, durationWeeks, examDate, today) : null;
  const summary = exam ? bufferSummary(exam.bufferWeeks) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 text-base font-bold text-text">
        ปฏิทินแผน {durationWeeks} สัปดาห์ <span className="text-sm font-normal text-text3">(เริ่มวันนี้)</span>
      </p>
      <PlanTimeline weeks={weeks} schedules={[]} exam={exam} />
      {summary && (
        <p className={`mt-2 text-sm font-semibold ${summary.ok ? "text-good" : "text-red"}`}>{summary.text}</p>
      )}
      <div className="mt-2">
        <PlanTimelineLegend />
      </div>
    </div>
  );
}

// ขั้น 3: กระจายบทที่ติ๊กลงสัปดาห์แบบประมาณการ (ตำแหน่งจริงขึ้นกับความเร็วในการฝึก)
function SelectionPreview({
  available,
  selectedKeys,
  passedKeys,
  durationWeeks,
  examDate,
}: {
  available: AvailableChapter[];
  selectedKeys: string[];
  passedKeys: string[];
  durationWeeks: number;
  examDate: string;
}) {
  if (selectedKeys.length === 0) return null;
  const today = toBkkYmd(new Date());
  const picks = selectedKeys
    .map((k) => available.find((c) => c.chapter_key === k))
    .filter((c): c is AvailableChapter => !!c);
  const weeks = buildWeeks(today, durationWeeks, today);
  const schedules = placeChapters(previewChapters(picks, passedKeys), today, durationWeeks, today);
  const exam = examDate ? examInfo(today, durationWeeks, examDate, today) : null;
  const fit = checkFit(schedules, durationWeeks, (s) => subjectGroupLabel(s.subject, s.branch));
  const examSummary = exam ? bufferSummary(exam.bufferWeeks) : null;
  const ok = fit.ok && (examSummary?.ok ?? true);
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="mb-2 text-base font-bold text-text">ตัวอย่างการกระจายบทตามสัปดาห์</p>
      <div
        className={`mb-3 rounded-xl border px-3 py-2 text-sm font-semibold ${
          ok ? "border-good/60 bg-good/10 text-good" : "border-red bg-red/10 text-red"
        }`}
      >
        {fit.text}
        {examSummary && !examSummary.ok && <span className="block">{examSummary.text}</span>}
      </div>
      <PlanTimeline weeks={weeks} schedules={schedules} exam={exam} />
      <p className="mt-2 text-xs text-text3">
        เป็นค่าประมาณ — บทจริงจะขยับตามความเร็วที่ฝึก (ผ่านเมื่อทำครบ 20 ข้อและแม่นพอ)
      </p>
      <div className="mt-2">
        <PlanTimelineLegend />
      </div>
    </div>
  );
}

export default function PlanWizard({
  studentId,
  studentUsername,
  viewerMode = "guardian",
}: {
  studentId: string;
  studentUsername: string;
  viewerMode?: ViewerMode;
}) {
  const isSelf = viewerMode === "self";
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
  // ลบบทออกจากคิว: ถามยืนยันใน BottomSheet ก่อนเรียก RPC (RPC แทนที่ทั้งลิสต์ ลบแล้วกลับมาได้ต้องเพิ่มใหม่เอง)
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  async function loadAll(silent = false) {
    if (!silent) setLoading(true);
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

  // ลากบท pending ไปสัปดาห์ใหม่: คำนวณลำดับคิวใหม่ (ดู reorderForDrop) -> optimistic -> RPC เดิม; error = rollback
  async function handleDropChapter(chapterKey: string, targetWeek: number) {
    if (submitting || plan.length === 0) return;
    const newOrderKeys = reorderForDrop(
      toScheduleChapters(plan),
      chapterKey,
      targetWeek,
      toBkkYmd(plan[0].plan_created_at),
      plan[0].duration_weeks,
      toBkkYmd(new Date())
    );
    if (!newOrderKeys) return;

    const snapshot = plan;
    const subjectOf = new Map(plan.map((r) => [r.chapter_key, r.subject]));
    const counters = new Map<string | null | undefined, number>();
    const orderOf = new Map<string, number>();
    for (const k of newOrderKeys) {
      const subj = subjectOf.get(k);
      const i = counters.get(subj) ?? 0;
      orderOf.set(k, i);
      counters.set(subj, i + 1);
    }
    setPlan((prev) =>
      prev.map((r) => (r.chapter_key && orderOf.has(r.chapter_key) ? { ...r, chapter_queue_order: orderOf.get(r.chapter_key)! } : r))
    );

    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("guardian_set_plan_chapter_queue", {
      p_plan_id: plan[0].plan_id,
      p_chapter_keys: newOrderKeys,
    });
    setSubmitting(false);
    if (error) {
      setPlan(snapshot);
      setError(`ย้ายบทไม่สำเร็จ: ${error.message}`);
      return;
    }
    await loadAll(true);
  }

  async function removeChapter(chapterKey: string) {
    setRemovingKey(null);
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
        {isSelf ? (
          "แผนฝึกของฉัน"
        ) : (
          <>
            แผนฝึกของ <span className="font-semibold text-text">{studentUsername}</span>
          </>
        )}
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

                <div className="gd-card p-4">
                  {(() => {
                    const start = toBkkYmd(plan[0].plan_created_at);
                    const n = plan[0].duration_weeks;
                    const today = toBkkYmd(new Date());
                    return (
                      <PlanKanban
                        weeks={buildWeeks(start, n, today)}
                        schedules={placeChapters(toScheduleChapters(plan), start, n, today)}
                        exam={plan[0].exam_date ? examInfo(start, n, plan[0].exam_date, today) : null}
                        busy={submitting}
                        onMove={handleDropChapter}
                        onRemove={setRemovingKey}
                      />
                    );
                  })()}
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
                      filterable
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

                {removingKey && (
                  <BottomSheet title="ลบบทนี้ออกจากแผน" onClose={() => setRemovingKey(null)}>
                    <div className="flex flex-col gap-3 p-4">
                      <p className="text-base text-text">
                        ลบ <span className="font-bold text-gold-hi">{plan.find((r) => r.chapter_key === removingKey)?.chapter ?? "บทนี้"}</span> ออกจากแผนใช่ไหม
                      </p>
                      <p className="text-sm text-text3">
                        ลบแล้วบทนี้จะหายจากคิว ถ้าต้องการกลับมาต้องกด "เพิ่มบทเข้าคิว" เพิ่มเองใหม่
                      </p>
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRemovingKey(null)}
                          className="flex-1 rounded-full border border-border py-3 text-base font-semibold text-text2"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => removeChapter(removingKey)}
                          className="flex-1 rounded-full bg-red py-3 text-base font-bold text-white disabled:opacity-50"
                        >
                          ลบออกจากแผน
                        </button>
                      </div>
                    </div>
                  </BottomSheet>
                )}

                {confirmingReplace && (
                  <BottomSheet title="เปลี่ยนโหมด / สร้างแผนใหม่" onClose={() => setConfirmingReplace(false)}>
                    <div className="flex flex-col gap-3 p-4">
                      <p className="text-base text-text">
                        {isSelf ? "บทที่คุณผ่านไปแล้ว" : "บทที่ลูกผ่านไปแล้ว"} <span className="font-bold text-emerald-400">จะไม่ต้องทำซ้ำ</span>{" "}
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
              {(isSelf ? FRAMEWORKS_SELF : FRAMEWORKS).map(({ value, label, description, Icon, badge }) => (
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

              <PlanCalendarPreview durationWeeks={durationWeeks} examDate={framework === "exam_prep" ? examDate : ""} />

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
              <SelectionPreview
                available={available}
                selectedKeys={selectedKeys}
                passedKeys={plan.filter((r) => r.chapter_status === "passed").map((r) => r.chapter_key as string)}
                durationWeeks={durationWeeks}
                examDate={framework === "exam_prep" ? examDate : ""}
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
              <p className="text-lg font-bold text-text">
                {isSelf ? "อยากฝึกสม่ำเสมอแค่ไหน" : "อยากให้ลูกฝึกสม่ำเสมอแค่ไหน"}
              </p>
              <p className="-mt-2 text-sm text-text3">ตั้งเป้าประจำสัปดาห์ควบคู่ไปด้วยได้ (ไม่ตั้งตอนนี้ก็ได้)</p>
              {(isSelf ? GOAL_LEVELS_SELF : GOAL_LEVELS).map(({ level, label, description }) => (
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
