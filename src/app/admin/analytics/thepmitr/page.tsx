import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ALL_GRADE_LEVELS } from "@/lib/gradeLevel";
import { aggregateAnalytics } from "@/lib/adminAnalytics";
import { loadAdminAnalytics } from "@/lib/adminAnalyticsServer";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import GradeLevelFilterSelect from "@/components/admin/GradeLevelFilterSelect";

const SCHOOL_NAME = "เทพมิตรศึกษา";

export default async function ThepmitrAnalyticsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  const admins = (process.env.ANALYTICS_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !admins.includes(user.email.toLowerCase())) redirect("/");

  const { grade } = await searchParams;
  const selectedGrade = typeof grade === "string" && ((ALL_GRADE_LEVELS as readonly string[]).includes(grade) || grade === "__null__") ? grade : undefined;
  const { profiles, attempts, questions, now } = await loadAdminAnalytics();
  const schoolProfiles = profiles.filter((p) => p.school === SCHOOL_NAME);
  const options = [
    { value: "", label: `ทุกระดับชั้น (${schoolProfiles.length})` },
    ...ALL_GRADE_LEVELS.map((value) => ({ value, label: `${value} (${schoolProfiles.filter((p) => p.grade_level === value).length})` })),
    { value: "__null__", label: `ไม่ระบุระดับชั้น (${schoolProfiles.filter((p) => !p.grade_level).length})` },
  ];
  const cohort = schoolProfiles.filter((p) => !selectedGrade || (selectedGrade === "__null__" ? !p.grade_level : p.grade_level === selectedGrade));
  const data = aggregateAnalytics(cohort, attempts, questions, now);
  const updated = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(now));
  return <main className="mx-auto flex min-h-screen w-full min-w-0 max-w-6xl flex-col gap-6 p-4 pb-16 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-gold-hi">Analytics · {SCHOOL_NAME}</h1>
        <p className="mt-1 text-sm text-text3">ภาพรวมการฝึกและบทเรียนที่ควรทบทวนของโรงเรียน</p>
        <p className="mt-2 text-xs text-text3">อัปเดต {updated} · เวลาไทย · ช่วง 7 / 14 วันรวมวันนี้</p>
      </div>
      <GradeLevelFilterSelect options={options} />
    </header>
    <AnalyticsDashboard data={data} />
  </main>;
}
