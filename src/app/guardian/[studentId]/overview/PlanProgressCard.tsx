import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { accuracyTextClass, subjectLabel } from "./shared";
import PlanTimeline, { PlanTimelineLegend } from "@/components/guardian/PlanTimeline";
import {
  bufferSummary,
  buildWeeks,
  examInfo,
  formatRange,
  formatShortDate,
  placeChapters,
  toBkkYmd,
  type ScheduleChapter,
} from "@/lib/planSchedule";
import { guardianBasePath, type ViewerMode } from "@/components/guardian/viewerMode";

export type PlanRow = {
  framework: string;
  duration_weeks: number;
  exam_date: string | null;
  plan_created_at: string;
  plan_status: string;
  chapter_key: string | null;
  subject: string | null;
  branch: string | null;
  chapter: string | null;
  chapter_status: "pending" | "current" | "passed" | "stuck" | null;
  chapter_queue_order: number | null;
  entered_current_at: string | null;
  passed_at: string | null;
};

// attempts_total + accuracy_recent เป็นชุดเดียวกับที่ guardian_advance_plan_if_passed ใช้ตัดสินผ่านจริง
// (ไม่ scope เวลา) — "N/20" จึงตรงกับเกณฑ์ผ่านเป๊ะ; มีแค่ accuracy_start ที่นับตั้งแต่บทนี้เป็น current
export type PlanProgress = {
  chapter_key: string;
  attempts_total: number;
  accuracy_start: number | null;
  accuracy_recent: number | null;
  pass_threshold_attempts: number;
};

const FRAMEWORK_LABEL: Record<string, string> = {
  school: "ตามที่โรงเรียนสอน",
  weak_spot: "ซ่อมจุดอ่อน",
  exam_prep: "เตรียมสอบ",
};

// section เด่นของภาพรวม: คำตอบของ "ที่วางแผนให้ลูกทำ ได้ผลไหม" — น้ำหนักเท่า Hero (gd-card-hero)
export default function PlanProgressCard({
  studentId,
  plan,
  progressByKey,
  viewerMode = "guardian",
}: {
  studentId: string;
  plan: PlanRow[];
  progressByKey: Map<string, PlanProgress>;
  viewerMode?: ViewerMode;
}) {
  const passed = plan.filter((r) => r.chapter_status === "passed").length;
  const currents = plan.filter((r) => r.chapter_status === "current" && r.chapter && r.subject);

  // ปฏิทินแผน: ตำแหน่งสัปดาห์ของบทที่รอคิวเป็นค่าประมาณที่คำนวณสด (ดู lib/planSchedule)
  const hasPlan = plan.length > 0 && !!plan[0].plan_created_at;
  const today = toBkkYmd(new Date());
  const startYmd = hasPlan ? toBkkYmd(plan[0].plan_created_at) : today;
  const n = hasPlan ? plan[0].duration_weeks : 0;
  const weeks = hasPlan ? buildWeeks(startYmd, n, today) : [];
  const curWeek = weeks.find((w) => w.isCurrent);
  const schedules = hasPlan
    ? placeChapters(
        plan
          .filter((r) => r.chapter_key && r.subject && r.chapter && r.chapter_status)
          .map(
            (r): ScheduleChapter => ({
              chapter_key: r.chapter_key as string,
              subject: r.subject as string,
              branch: r.branch,
              chapter: r.chapter as string,
              queue_order: r.chapter_queue_order ?? 0,
              status: r.chapter_status as ScheduleChapter["status"],
              entered_current_at: r.entered_current_at,
              passed_at: r.passed_at,
            })
          ),
        startYmd,
        n,
        today
      )
    : [];
  const exam = hasPlan && plan[0].exam_date ? examInfo(startYmd, n, plan[0].exam_date, today) : null;
  const planEnded = hasPlan && weeks.length > 0 && today > weeks[weeks.length - 1].endYmd;

  return (
    <Link
      href={`${guardianBasePath(viewerMode, studentId)}/plan`}
      className="gd-card-hero block p-5 transition hover:brightness-110 md:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-mint">แผนการเรียน</p>
          {plan.length === 0 ? (
            <p className="mt-1 text-base text-text">ยังไม่มีแผน — แตะเพื่อสร้าง</p>
          ) : (
            <p className="mt-1 text-base text-text">
              {FRAMEWORK_LABEL[plan[0].framework] ?? plan[0].framework} · ผ่านแล้ว {passed}/{plan.length} บท
            </p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text2">
          จัดการแผน
          <ChevronRight className="h-5 w-5" />
        </span>
      </div>

      {hasPlan && curWeek && (
        <div className="mt-4 rounded-2xl border border-[#385b57] bg-[#1e2f30] p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-base font-bold text-text">
              ปฏิทินแผนฝึก · {planEnded ? `ครบ ${n} สัปดาห์แล้ว` : `สัปดาห์ที่ ${curWeek.index + 1} จาก ${n}`}
              <span className="ml-2 text-sm font-normal text-text2">({formatRange(curWeek.startYmd, curWeek.endYmd)})</span>
            </p>
            {exam && (
              <p className="text-sm font-semibold text-gold-hi">
                🚩 สอบ {formatShortDate(exam.examYmd)}
                {exam.daysToExam >= 0 ? ` · อีก ${exam.daysToExam} วัน` : ""}
              </p>
            )}
          </div>
          <PlanTimeline weeks={weeks} schedules={schedules} exam={exam} />
          {exam && exam.bufferWeeks !== 0 && (
            <p className={`mt-2 text-sm ${bufferSummary(exam.bufferWeeks).ok ? "text-text2" : "text-red"}`}>
              {bufferSummary(exam.bufferWeeks).text}
            </p>
          )}
          <p className="mt-2 text-[11px] text-text3">ตำแหน่งบทที่รอคิวเป็นค่าประมาณ — ขยับตามความเร็วที่ฝึกจริง</p>
          <div className="mt-1">
            <PlanTimelineLegend />
          </div>
        </div>
      )}

      {plan.length > 0 && currents.length === 0 && (
        <p className="mt-4 text-base text-text2">ตอนนี้ไม่มีบทที่กำลังเรียนอยู่ — ทุกวิชาในแผนผ่านครบแล้ว</p>
      )}

      {currents.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {currents.map((r) => {
            const p = progressByKey.get(r.chapter_key as string);
            const start = p?.accuracy_start ?? null;
            const recent = p?.accuracy_recent ?? null;
            const hasCompare = start !== null && recent !== null;
            const threshold = p?.pass_threshold_attempts ?? 20;
            const total = p?.attempts_total ?? 0;
            const pct = Math.min(100, Math.round((total / threshold) * 100));
            const reached = total >= threshold;
            const delta = hasCompare ? recent - start : 0;

            return (
              <div key={r.chapter_key} className="rounded-2xl border border-[#385b57] bg-[#1e2f30] p-4">
                <p className="text-xs font-semibold text-mint">🎯 {subjectLabel(r.subject as string, r.branch)}</p>
                <p className="mt-0.5 text-base font-bold leading-snug text-text md:text-lg">{r.chapter}</p>

                {p ? (
                  <>
                    <div className="mt-3 flex items-end gap-3">
                      <div>
                        <p className="text-[11px] text-text3">ตอนเริ่ม</p>
                        <p className={`text-3xl font-bold leading-none ${start !== null ? accuracyTextClass(start) : "text-text3"}`}>
                          {start !== null ? `${start}%` : "—"}
                        </p>
                      </div>
                      <span className="pb-1 text-2xl text-text3" aria-hidden>
                        →
                      </span>
                      <div>
                        <p className="text-[11px] text-text3">ตอนนี้</p>
                        <p className={`text-4xl font-bold leading-none ${recent !== null ? accuracyTextClass(recent) : "text-text3"}`}>
                          {recent !== null ? `${recent}%` : "—"}
                        </p>
                      </div>
                      {hasCompare && delta !== 0 && (
                        <span
                          className={`pb-1 text-base font-bold ${delta > 0 ? "text-good" : "text-red"}`}
                          aria-label={delta > 0 ? "ดีขึ้น" : "ลดลง"}
                        >
                          {delta > 0 ? "⬆️" : "⬇️"} {Math.abs(delta)}%
                        </span>
                      )}
                    </div>
                    {!hasCompare && (
                      <p className="mt-2 text-xs text-text3">ยังไม่มีข้อมูลเพียงพอสำหรับเทียบ</p>
                    )}

                    <div className="mt-3">
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="text-text2">
                          ทำไปแล้ว <span className="text-sm font-bold text-text">{total}</span>/{threshold} ข้อ
                        </span>
                        {reached && <span className="text-text3">ถึงเกณฑ์จำนวนข้อแล้ว</span>}
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow={Math.min(total, threshold)} aria-valuemin={0} aria-valuemax={threshold}>
                        <div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} />
                      </div>
                      {reached && <p className="mt-1 text-[11px] text-text3">ผ่านเมื่อความแม่น 15 ข้อล่าสุดถึง 70%</p>}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-text3">ยังไม่มีข้อมูลความคืบหน้า</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
