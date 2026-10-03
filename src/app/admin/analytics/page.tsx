import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { aggregateAnalytics } from "@/lib/adminAnalytics";
import { loadAdminAnalytics } from "@/lib/adminAnalyticsServer";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import SchoolFilterSelect from "@/components/admin/SchoolFilterSelect";

export default async function AdminAnalyticsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !admins.includes(user.email.toLowerCase())) redirect("/");

  const { school } = await searchParams;
  const selectedSchool = typeof school === "string" && school ? school : undefined;
  const { profiles, attempts, questions, now } = await loadAdminAnalytics();
  const schools = new Map<string, number>();
  for (const profile of profiles) {
    const key = profile.school || "__null__";
    schools.set(key, (schools.get(key) ?? 0) + 1);
  }
  const options = [
    { value: "", label: `ทุกโรงเรียน (${profiles.length})` },
    ...[...schools].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({
      value, label: `${value === "__null__" ? "ไม่ระบุโรงเรียน" : value} (${count})`,
    })),
  ];
  if (selectedSchool && !schools.has(selectedSchool)) options.push({ value: selectedSchool, label: "โรงเรียนที่เลือก (ไม่มีข้อมูล)" });
  const cohort = profiles.filter((p) => !selectedSchool || (selectedSchool === "__null__" ? !p.school : p.school === selectedSchool));
  const data = aggregateAnalytics(cohort, attempts, questions, now);
  const updated = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(now));
  return <main className="mx-auto flex min-h-screen w-full min-w-0 max-w-6xl flex-col gap-6 p-4 pb-16 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-gold-hi">Analytics</h1>
        <p className="mt-1 text-sm text-text3">ภาพรวมการฝึกและบทเรียนที่ควรทบทวน</p>
        <p className="mt-2 text-xs text-text3">อัปเดต {updated} · เวลาไทย · ช่วง 7 / 14 วันรวมวันนี้</p>
      </div>
      <SchoolFilterSelect options={options} />
    </header>
    <AnalyticsDashboard data={data} />
  </main>;
}
