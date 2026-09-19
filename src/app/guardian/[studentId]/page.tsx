import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getGuardianAccess, getGuardianStudents } from "@/lib/guardian";
import { createClient } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import type { Subline, Personality } from "@/lib/evolution";
import TrendCard from "./overview/TrendCard";
import InsightCards from "./overview/InsightCards";
import PlanProgressCard, { type PlanProgress, type PlanRow } from "./overview/PlanProgressCard";
import {
  accuracyBgClass,
  accuracyTextClass,
  subjectLabel,
  type ChapterChange,
  type SubjectRow,
  type TrendDay,
} from "./overview/shared";

export const dynamic = "force-dynamic";

// เปลี่ยน decision เดิมโดยเจตนา (ปอนด์ยืนยัน 2026-09-19): หน้านี้เคยล็อกไว้ว่า "แถบเป้าโชว์ 5-band เท่านั้น
// ไม่โชว์ตัวเลขจริง" และ "B2: ห้ามโชว์ % ใช้ tier + จำนวนข้อ" ตอนนี้ Overview ถูกออกแบบใหม่ให้เป็นหน้ารวม
// สรุปที่มีข้อมูลจริง — โชว์ accuracy % คู่จำนวนข้อ และตัวเลขแต้มดิบของเป้า (เช่น 279 / ~300) กำกับระดับ
// ภาษาคนเสมอ เพราะระดับอย่างเดียว ("ไปได้ดี") ทำให้ผู้ปกครองประเมินไม่ได้ว่าใกล้/ไกลเป้าแค่ไหน

type QmonDisplay = {
  nickname: string;
  stage: number;
  subline: string | null;
  personality: string | null;
  egg_sprite_prefix: string;
  egg_name_th: string;
};

type GoalProgress = { has_goal: boolean; goal_level: string | null; bucket: string | null };
type GoalPoints = { has_goal: boolean; level: string | null; total_points: number; computed_target: number | null };
const LEVEL_LABEL: Record<string, string> = { relaxed: "สบายๆ", steady: "กำลังดี", challenging: "ท้าทาย" };

function petImagePathFor(qmon: QmonDisplay): string | null {
  try {
    return getPetImagePath(
      qmon.egg_sprite_prefix,
      qmon.stage,
      qmon.subline as Subline | null,
      qmon.personality as Personality | null
    );
  } catch {
    return null;
  }
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`gd-card p-4 ${className}`}>{children}</div>;
}

export default async function GuardianStudentDashboardPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const access = await getGuardianAccess();
  if (access.status !== "ok") {
    redirect("/guardian");
  }

  const { studentId } = await params;
  const students = await getGuardianStudents();
  const student = students.find((s) => s.student_id === studentId);

  if (!student) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-text2">
        ไม่พบนักเรียนคนนี้ หรือยังไม่ได้ลิงก์บัญชีกับคุณ — กลับไปหน้า{" "}
        <Link href="/guardian" className="text-gold-hi underline">
          ผู้พิทักษ์
        </Link>
      </div>
    );
  }

  const supabase = await createClient();

  const [qmonRes, trendRes, goalRes, pointsRes, changesRes, subjectRes, planRes, progressRes] =
    await Promise.all([
      supabase.rpc("guardian_get_qmon_display", { p_student_id: studentId }),
      supabase.rpc("guardian_get_daily_trend", { p_student_id: studentId, p_end_date: null, p_days: 30 }),
      supabase.rpc("guardian_get_goal_progress", { p_student_id: studentId }),
      supabase.rpc("guardian_get_goal_points", { p_student_id: studentId }),
      supabase.rpc("guardian_get_chapter_status_changes", { p_student_id: studentId }),
      supabase.rpc("guardian_get_subject_comparison", { p_student_id: studentId, p_days: 30 }),
      supabase.rpc("guardian_get_plan", { p_student_id: studentId }),
      supabase.rpc("guardian_get_plan_progress", { p_student_id: studentId }),
    ]);

  // fire-and-forget ตาม spec ของ guardian_log_insight_view — await เพื่อกันโดน cut off ก่อน
  // เขียนจบ (server component จบ request แล้ว process อาจไม่รอ promise ที่ลอยอยู่ให้)
  // ไม่ทำให้หน้าเด้ง error ถ้า log ล้มเหลว (audit log พังไม่ควรบล็อกการดูข้อมูล)
  await supabase.rpc("guardian_log_insight_view", { p_student_id: studentId }).then(
    () => {},
    () => {}
  );

  const qmon = (qmonRes.data?.[0] ?? null) as QmonDisplay | null;
  const trend = (trendRes.data ?? []) as TrendDay[];
  const goal = (goalRes.data?.[0] ?? null) as GoalProgress | null;
  const points = (pointsRes.data?.[0] ?? null) as GoalPoints | null;
  const changes = (changesRes.data ?? []) as ChapterChange[];
  const subjects = (subjectRes.data ?? []) as SubjectRow[];
  const plan = (planRes.data ?? []) as PlanRow[];
  // ถ้า RPC นี้ล้มเหลวการ์ดแผนยังโชว์ชื่อบท current ตามเดิม แค่ไม่มีบรรทัดเทียบ
  const progressByKey = new Map(((progressRes.data ?? []) as PlanProgress[]).map((p) => [p.chapter_key, p]));

  const petImagePath = qmon ? petImagePathFor(qmon) : null;
  const today = trend[trend.length - 1];
  const hasGoal = !!goal?.has_goal;
  const target = points?.computed_target ?? null;
  const goalPct = hasGoal && target ? Math.min(100, Math.round(((points?.total_points ?? 0) / target) * 100)) : 0;

  // current มีได้ 1 บทต่อวิชา — ส่ง chapter_key ไปให้ day-breakdown ติดป้าย "ตามแผน"
  const planCurrentKeys = plan
    .filter((r) => r.chapter_status === "current" && r.chapter && r.subject)
    .map((r) => r.chapter_key as string);

  return (
    <div className="flex flex-col gap-4">
      {/* หัว: ชื่อลูก + Qmon */}
      <Card className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-track">
          {petImagePath ? (
            <Image src={petImagePath} alt="" width={48} height={48} />
          ) : (
            <span className="text-xs text-text3">—</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-gold-hi">{student.username}</p>
          {qmon ? (
            <p className="truncate text-xs text-text3">
              Qmon: {qmon.nickname} ({qmon.egg_name_th})
            </p>
          ) : (
            <p className="text-xs text-text3">ยังไม่มี Qmon</p>
          )}
        </div>
      </Card>

      {/* Hero — มือถือ: การ์ดรวม (วันนี้ + ความสม่ำเสมอ) แล้วการ์ดกราฟแยก / ≥768px: การ์ดเดียว 3 คอลัมน์ */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[1fr_1fr_1.8fr] md:gap-0 gd-card-hero-md">
        <div className="gd-card-hero md:contents">
          <div className="p-4">
            <p className="text-xs text-text3">วันนี้</p>
            {today?.has_data ? (
              <>
                <p className="mt-1 text-3xl font-bold text-text">
                  {today.correct_count}
                  <span className="text-base font-normal text-text2"> / {today.total_count} ข้อถูก</span>
                </p>
                <p className={`text-sm font-semibold ${accuracyTextClass(today.accuracy ?? 0)}`}>
                  ความแม่น {today.accuracy}%
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-text2">วันนี้ยังไม่ได้เริ่มตอบข้อ</p>
            )}
          </div>

          <div className="border-t border-border p-4 md:border-l md:border-t-0">
            <p className="text-xs text-text3">ความสม่ำเสมอสัปดาห์นี้</p>
            {hasGoal ? (
              <>
                <p className="mt-1 text-xl font-bold text-text">{goal?.bucket}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-amber" style={{ width: `${goalPct}%` }} />
                </div>
                <p className="mt-1 text-xs text-text2">
                  {points?.total_points ?? 0} / เป้าหมาย ~{target} แต้ม
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-text2">ยังไม่ได้ตั้งเป้าหมายสัปดาห์นี้</p>
            )}
          </div>
        </div>

        <div className="gd-card p-4 md:rounded-none md:border-0 md:border-l md:border-[#385b57] md:bg-transparent md:shadow-none">
          <TrendCard studentId={studentId} days30={trend} planChapterKeys={planCurrentKeys} />
        </div>
      </div>

      {/* แผนการเรียน — section เด่นเต็มความกว้าง (คำตอบของ "ที่วางแผนให้ลูกทำ ได้ผลไหม") */}
      <PlanProgressCard studentId={studentId} plan={plan} progressByKey={progressByKey} />

      {/* จุดที่น่าสนใจ + เทียบวิชา */}
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[2fr_1fr]">
        <Card>
          <InsightCards changes={changes} />
        </Card>
        <Card>
          <p className="mb-3 text-sm font-semibold text-mint">เทียบวิชา (30 วันล่าสุด)</p>
          {subjects.length === 0 ? (
            <p className="text-sm text-text3">ยังไม่มีวิชาที่ข้อมูลพอ (ต้องตอบอย่างน้อย 10 ข้อ)</p>
          ) : (
            <div className="flex flex-col gap-3">
              {subjects.map((s) => (
                <div key={`${s.subject}-${s.branch ?? ""}`}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-text">{subjectLabel(s.subject, s.branch)}</span>
                    <span className="text-xs text-text2">
                      <span className={`font-semibold ${accuracyTextClass(s.accuracy)}`}>{s.accuracy}%</span> ·{" "}
                      {s.answered_count} ข้อ
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-track">
                    <div className={`h-full rounded-full ${accuracyBgClass(s.accuracy)}`} style={{ width: `${s.accuracy}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* เป้าหมาย — การ์ดเล็ก กดไปหน้าเต็ม (แผนการเรียนย้ายขึ้นเป็น section เด่นด้านบนแล้ว) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href={`/guardian/${studentId}/goal`}
          className="gd-card flex items-center justify-between gap-3 p-4 transition hover:border-mint"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mint">เป้าความสม่ำเสมอ</p>
            {hasGoal ? (
              <>
                <p className="mt-1 text-sm text-text">
                  ระดับ{LEVEL_LABEL[goal?.goal_level ?? ""] ?? goal?.goal_level} · {goal?.bucket}
                </p>
                <p className="text-xs text-text2">
                  {points?.total_points ?? 0} / ~{target} แต้ม ({goalPct}%)
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-text2">ยังไม่ได้ตั้งเป้าหมายสัปดาห์นี้ — แตะเพื่อตั้ง</p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-text3" />
        </Link>
      </div>
    </div>
  );
}
