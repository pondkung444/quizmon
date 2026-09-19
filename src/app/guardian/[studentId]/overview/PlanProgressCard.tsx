import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { accuracyTextClass, subjectLabel } from "./shared";

export type PlanRow = {
  framework: string;
  plan_status: string;
  chapter_key: string | null;
  subject: string | null;
  branch: string | null;
  chapter: string | null;
  chapter_status: "pending" | "current" | "passed" | "stuck" | null;
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
}: {
  studentId: string;
  plan: PlanRow[];
  progressByKey: Map<string, PlanProgress>;
}) {
  const passed = plan.filter((r) => r.chapter_status === "passed").length;
  const currents = plan.filter((r) => r.chapter_status === "current" && r.chapter && r.subject);

  return (
    <Link
      href={`/guardian/${studentId}/plan`}
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
