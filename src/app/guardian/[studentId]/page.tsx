import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getGuardianAccess, getGuardianStudents } from "@/lib/guardian";
import { createClient } from "@/lib/supabase/server";
import { getPetImagePath } from "@/lib/petImage";
import type { Subline, Personality } from "@/lib/evolution";
import ChapterList from "./ChapterList";

export const dynamic = "force-dynamic";

type QmonDisplay = {
  nickname: string;
  stage: number;
  subline: string | null;
  personality: string | null;
  egg_sprite_prefix: string;
  egg_name_th: string;
};

type WeeklyCalendarDay = {
  d: string;
  day_points: number;
  has_data: boolean;
  is_today: boolean;
  is_future: boolean;
};

type GoalProgress = {
  goal_week_start: string;
  has_goal: boolean;
  goal_level: string | null;
  bucket: string | null;
};

const DAY_LABEL_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

// ไล่เฉดเดียวกับ expTierClass/expTierTextClass (src/lib/expTier.ts) ที่ใช้ในปฏิทินฝั่งเด็ก
// (ตามเอกสารออกแบบ: "ใช้ตรรกะและหน้าตาซ้ำได้เลย") แต่ปรับ threshold ใหม่ เพราะ day_points ของ
// guardian_get_weekly_calendar เพดานอยู่ที่ 50/วัน ไม่ใช่ 180 เหมือน EXP — คง % ratio เดิมไว้
// (0% / ~33% / ~67% / <100% / 100% ของเพดาน)
function dayPointsTierClass(points: number): string {
  if (points <= 0) return "bg-track";
  if (points < 17) return "bg-indigo-dim";
  if (points < 33) return "bg-indigo";
  if (points < 50) return "bg-gold";
  return "bg-amber shadow-[0_0_10px_2px_var(--color-amber)]";
}

function dayPointsTextClass(points: number): string {
  return points < 17 ? "text-text" : "text-track";
}

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
      <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center gap-6 bg-bg p-6 text-text">
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-text2">
          ไม่พบนักเรียนคนนี้ หรือยังไม่ได้ลิงก์บัญชีกับคุณ — กลับไปหน้า{" "}
          <Link href="/guardian" className="text-gold-hi underline">
            ผู้พิทักษ์
          </Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  const [qmonRes, calendarRes, categoriesRes, goalRes] = await Promise.all([
    supabase.rpc("guardian_get_qmon_display", { p_student_id: studentId }),
    supabase.rpc("guardian_get_weekly_calendar", { p_student_id: studentId, p_week_start_date: null }),
    supabase.rpc("guardian_get_categories", { p_student_id: studentId }),
    supabase.rpc("guardian_get_goal_progress", { p_student_id: studentId }),
  ]);

  // fire-and-forget ตาม spec ของ guardian_log_insight_view — await เพื่อกันโดน cut off ก่อน
  // เขียนจบ (server component จบ request แล้ว process อาจไม่รอ promise ที่ลอยอยู่ให้)
  // ไม่ทำให้หน้าเด้ง error ถ้า log ล้มเหลว (audit log พังไม่ควรบล็อกการดูข้อมูล)
  await supabase.rpc("guardian_log_insight_view", { p_student_id: studentId }).then(
    () => {},
    () => {}
  );

  const qmon = (qmonRes.data?.[0] ?? null) as QmonDisplay | null;
  const calendar = (calendarRes.data ?? []) as WeeklyCalendarDay[];
  const categories = categoriesRes.data ?? [];
  const goal = (goalRes.data?.[0] ?? null) as GoalProgress | null;

  const petImagePath = qmon ? petImagePathFor(qmon) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-5 bg-bg p-6 text-text">
      {/* หัว: ชื่อลูก + Qmon — B5 ในเอกสารออกแบบ: เรื่องคุยที่ไม่ใช่การเรียน ต้นทุนแทบเป็นศูนย์ */}
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-track">
          {petImagePath ? (
            <Image src={petImagePath} alt="" width={56} height={56} />
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
      </div>

      {/* ปฏิทิน 7 ช่อง — ย่อจากปฏิทินรายเดือนฝั่งเด็ก (PetCalendarClient) มาเป็นรายสัปดาห์ */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold text-gold-hi">ภาพรวมสัปดาห์นี้</p>
        <div className="grid grid-cols-7 gap-1.5">
          {calendar.map((day, i) => (
            <div key={day.d} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-text3">{DAY_LABEL_TH[i] ?? ""}</span>
              <div
                className={`flex aspect-square w-full items-center justify-center rounded-lg text-xs font-medium ${
                  day.is_future
                    ? "border border-dashed border-border bg-transparent text-text3 opacity-40"
                    : `${dayPointsTierClass(day.day_points)} ${dayPointsTextClass(day.day_points)}`
                } ${day.is_today ? "ring-2 ring-gold-hi" : ""}`}
              >
                {day.is_future ? "" : day.day_points}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* แถบเป้า — 5-band message เท่านั้น ไม่โชว์ตัวเลขจริง (ตาม spec ที่ล็อกไว้) */}
      <Link
        href={`/guardian/goal?student=${studentId}`}
        className="rounded-xl border border-border bg-card p-4 transition hover:border-gold"
      >
        <p className="text-sm font-semibold text-gold-hi">เป้าความสม่ำเสมอ</p>
        {goal?.has_goal ? (
          <p className="mt-1 text-xl font-bold text-text">{goal.bucket}</p>
        ) : (
          <p className="mt-1 text-sm text-text2">ยังไม่ได้ตั้งเป้าหมายสัปดาห์นี้ — แตะเพื่อตั้ง</p>
        )}
      </Link>

      {/* จุดอ่อนรายบท — B2: ห้ามโชว์ %, ใช้ tier + จำนวนข้อ, หน้าแรกโชว์ 3 บท + ดูทั้งหมด */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-semibold text-gold-hi">จุดที่น่าสนใจรายบท (30 วันล่าสุด)</p>
        <ChapterList categories={categories} />
      </div>

      {/* ปุ่ม 2 ปุ่มปิดท้าย — ไปแผนการเรียน / ไปตั้งเป้าหมาย ของนักเรียนคนนี้ */}
      <div className="flex gap-3">
        <Link
          href={`/guardian/plan?student=${studentId}`}
          className="flex-1 rounded-full border border-gold-hi py-2.5 text-center text-sm font-semibold text-gold-hi transition hover:bg-gold-hi/10"
        >
          ดูแผนการเรียน
        </Link>
        <Link
          href={`/guardian/goal?student=${studentId}`}
          className="flex-1 rounded-full py-2.5 text-center text-sm font-semibold text-track transition hover:opacity-90"
          style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
        >
          ตั้งเป้าหมาย
        </Link>
      </div>
    </main>
  );
}
