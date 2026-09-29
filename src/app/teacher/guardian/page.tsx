import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayInBangkok } from "@/lib/exp";
import type { DigestRow } from "@/lib/guardian/digest";
import DigestBoard from "./DigestBoard";

export const dynamic = "force-dynamic";
// เจน Gemini ใน server action (≤ 25 วิ/ครั้ง, retry ได้) — 60 วิ คือเพดาน Vercel Hobby (เท่ากับ cron อื่นของโปรเจกต์)
export const maxDuration = 60;

const EARLIEST_WEEK = "2026-07-27"; // ก่อนวันนี้กติกาคะแนนต่างกัน (ตรงกับ RPC)
const MAX_WEEKS_BACK = 8;
const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}
function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// /teacher/guardian — สรุปรายสัปดาห์ถึงผู้ปกครอง (เข้าตรง URL เท่านั้น ไม่มีลิงก์จากหน้าอื่น)
// gate: RPC เช็ค guardian_digest_admin เอง — ไม่มีสิทธิ์ → notFound() (ไม่เปิดเผยว่ามีหน้านี้)
export default async function TeacherGuardianDigestPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = getTodayInBangkok();
  const todayMs = toUtc(today);
  const dow = new Date(todayMs).getUTCDay(); // 0 = อาทิตย์
  const thisMonday = toIso(todayMs - ((dow + 6) % 7) * DAY_MS);

  const weekOptions: string[] = [];
  for (let i = 0; i <= MAX_WEEKS_BACK; i++) {
    const w = toIso(toUtc(thisMonday) - i * 7 * DAY_MS);
    if (w < EARLIEST_WEEK) break;
    weekOptions.push(w);
  }

  const { week } = await searchParams;
  const weekStart = week && weekOptions.includes(week) ? week : thisMonday;

  const { data, error } = await supabase.rpc("guardian_admin_weekly_digest", { p_week_start: weekStart });
  if (error) {
    if (error.message.includes("ไม่มีสิทธิ์")) notFound();
    return (
      <main className="mx-auto max-w-sm px-4 py-12 text-center text-text3">
        โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง
      </main>
    );
  }

  return (
    <DigestBoard
      key={weekStart}
      weekStart={weekStart}
      weekOptions={weekOptions}
      isCurrentWeek={weekStart === thisMonday}
      isSunday={dow === 0}
      rows={(data ?? []) as DigestRow[]}
    />
  );
}
