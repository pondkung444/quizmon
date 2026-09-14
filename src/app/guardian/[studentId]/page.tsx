import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getGuardianAccess } from "@/lib/guardian";
import { createClient } from "@/lib/supabase/server";
import { resolvePetDisplay } from "@/components/social/petSummary";
import CategoriesSection, { type CategoryRow } from "./CategoriesSection";

export const dynamic = "force-dynamic";

const WEEKDAY_LABEL_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]; // ตรงกับ Date#getUTCDay(): 0=อา..6=ส

type CalendarDay = { d: string; day_points: number; has_data: boolean; is_today: boolean; is_future: boolean };
type GoalRow = { goal_id: string; subject: string; category: string; bucket: string };
type QmonRow = {
  nickname: string | null;
  stage: number;
  subline: string | null;
  personality: string | null;
  egg_sprite_prefix: string;
  egg_name_th: string;
};

function weekdayLabel(dateStr: string): string {
  return WEEKDAY_LABEL_TH[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

export default async function GuardianStudentInsightPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  const access = await getGuardianAccess();
  if (access.status !== "ok") {
    redirect("/guardian");
  }

  const supabase = await createClient();

  const [
    { data: students },
    { data: qmonRows, error: qmonError },
    { data: calendar, error: calendarError },
    { data: goals, error: goalsError },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase.rpc("guardian_get_students"),
    supabase.rpc("guardian_get_qmon_display", { p_student_id: studentId }),
    supabase.rpc("guardian_get_weekly_calendar", { p_student_id: studentId }),
    supabase.rpc("guardian_get_goal_progress", { p_student_id: studentId }),
    supabase.rpc("guardian_get_categories", { p_student_id: studentId }),
  ]);

  // guardian_* RPC ทุกตัวเช็ค guardian_links.status='claimed' เอง — error แปลว่านักเรียนคนนี้
  // ไม่ได้ลิงก์กับผู้ปกครองคนนี้จริง (เช่น แก้ URL มั่ว) ไม่ใช่แค่ error เครือข่ายทั่วไป
  if (qmonError || calendarError || goalsError || categoriesError) {
    notFound();
  }

  type StudentRow = { student_id: string; username: string | null; grade_level: string | null };
  const student = ((students ?? []) as StudentRow[]).find((s) => s.student_id === studentId);
  if (!student) {
    notFound();
  }

  // เรียก log แยกจาก Promise.all ด้านบน — ไม่อยากให้ความล้มเหลวของการ log (ซึ่งไม่ควรเกิด
  // เพราะ gate เดียวกันผ่านมาแล้ว) บล็อกการ render หน้า จึง fire-and-forget แบบ try/catch เงียบ
  try {
    await supabase.rpc("guardian_log_insight_view", { p_student_id: studentId });
  } catch {
    // ไม่บล็อกการ render — audit log พลาดไม่ควรทำให้ผู้ปกครองเห็นหน้าขาว
  }

  const qmon = ((qmonRows ?? []) as QmonRow[])[0] ?? null;
  const qmonDisplay = qmon
    ? resolvePetDisplay({
        eggSpritePrefix: qmon.egg_sprite_prefix,
        stage: qmon.stage,
        subline: qmon.subline,
        personality: qmon.personality,
        eggNameTh: qmon.egg_name_th,
      })
    : null;

  const calendarDays = (calendar ?? []) as CalendarDay[];
  const goalRows = (goals ?? []) as GoalRow[];
  const categoryRows = (categories ?? []) as CategoryRow[];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-5 bg-bg p-6 pb-10 text-text">
      {/* 1) หัว — ชื่อลูก + Qmon */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-full border border-gold-dim bg-track">
          {qmonDisplay?.imagePath && (
            <Image
              src={qmonDisplay.imagePath}
              alt={qmonDisplay.speciesName}
              width={56}
              height={56}
              className="h-full w-full object-contain"
            />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-gold-hi">{student.username ?? "นักเรียน"}</p>
          <p className="truncate text-xs text-text3">
            {qmon ? (qmon.nickname ?? qmonDisplay?.speciesName ?? "Qmon") : "ยังไม่มี Qmon"}
          </p>
        </div>
      </div>

      {/* 2) ปฏิทิน 7 ช่อง */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold text-text2">ภาพรวมสัปดาห์นี้</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day) => (
            <div
              key={day.d}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 ${
                day.is_today
                  ? "border-gold bg-gold-dim/15"
                  : day.is_future
                    ? "border-border/50 opacity-40"
                    : "border-border bg-track"
              }`}
            >
              <span className="text-[11px] font-medium text-text3">{weekdayLabel(day.d)}</span>
              <span className="text-sm font-bold text-text">{day.is_future ? "—" : day.day_points}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3) เป้าความสม่ำเสมอ — bucket ข้อความล้วน ห้ามคำนวณ % เอง */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold text-text2">เป้าความสม่ำเสมอ</h2>
        {goalRows.length === 0 ? (
          <p className="text-sm text-text3">ยังไม่ได้ตั้งเป้าหมาย</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {goalRows.map((g) => (
              <li
                key={g.goal_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-track px-3 py-2"
              >
                <span className="truncate text-sm text-text">{g.category}</span>
                <span className="flex-none text-sm font-semibold text-gold-hi">{g.bucket}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4) จุดอ่อน/แข็งรายบท */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold text-text2">บทที่น่าสนใจ</h2>
        <CategoriesSection categories={categoryRows} />
      </section>

      {/* 5) "สิ่งที่คุณส่งไปได้ผล" — ยังไม่มี guardian-authored-quest table รองรับ (Phase 1 gap
          ที่ระบุไว้แล้ว) และ design doc (Guardrail + โมเดลธุรกิจ + Pilot) เองก็ระบุว่ายังเป็นแค่ไอเดีย
          ที่ยังไม่ได้สร้างจริง — ข้ามส่วนนี้ทั้งหมดแทนที่จะทำ placeholder ลอยๆ */}

      {/* 6) ปุ่ม 2 ปุ่มด้านล่าง — ทั้งสองหน้าปลายทางยังไม่ได้สร้าง (404 ไปก่อนตามที่ตกลง) */}
      <div className="mt-2 flex gap-3">
        <Link
          href="/guardian/goal"
          className="flex-1 rounded-full border border-border py-2.5 text-center text-sm font-semibold text-text2 transition hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          ตั้งเป้าหมาย
        </Link>
        <Link
          href="/guardian/plan"
          className="flex-1 rounded-full py-2.5 text-center text-sm font-semibold text-track transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-hi focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
        >
          จัดการแผน
        </Link>
      </div>
    </main>
  );
}
