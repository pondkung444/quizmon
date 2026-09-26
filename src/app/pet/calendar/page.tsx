import { createClient, getUser } from "@/lib/supabase/server";
import { getCalendarMonth } from "@/lib/petCalendar";
import { DAILY_EXP_CAP, getTodayInBangkok } from "@/lib/exp";
import { getDailyExpCap } from "@/lib/dailyExpCap";
import PetCalendarClient from "@/components/PetCalendarClient";
import SignOutLink from "@/components/SignOutLink";

function parseIntParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default async function PetCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const todayStr = getTodayInBangkok();
  const [todayYear, todayMonth] = todayStr.split("-").map(Number);

  let year = parseIntParam(params.year) ?? todayYear;
  let month = parseIntParam(params.month) ?? todayMonth;
  if (month < 1 || month > 12) {
    year = todayYear;
    month = todayMonth;
  }

  // กันเดือนอนาคต (เช่น แก้ query string เอง) — clamp กลับมาเดือนปัจจุบันเสมอ
  if (year > todayYear || (year === todayYear && month > todayMonth)) {
    year = todayYear;
    month = todayMonth;
  }

  const supabase = await createClient();
  const user = await getUser();

  const dailyCap = user ? await getDailyExpCap(user.id) : DAILY_EXP_CAP;
  const days = user ? await getCalendarMonth(supabase, user.id, year, month, dailyCap) : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 px-4 pt-6 pb-24">
      <SignOutLink />
      {user ? (
        <PetCalendarClient
          year={year}
          month={month}
          days={days}
          dailyCap={dailyCap}
          isCurrentMonth={year === todayYear && month === todayMonth}
        />
      ) : (
        <div className="rounded-2xl border border-gold-dim bg-card p-8 text-center text-sm text-text3">
          เข้าสู่ระบบก่อนเพื่อดูปฏิทิน
        </div>
      )}
    </main>
  );
}
