import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuardianAccess, getGuardianStudents } from "@/lib/guardian";
import StudentPicker from "@/components/guardian/StudentPicker";
import GoalPanel from "./GoalPanel";

export const dynamic = "force-dynamic";

export default async function GuardianGoalPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const access = await getGuardianAccess();
  if (access.status !== "ok") {
    redirect("/guardian");
  }

  const { student: studentParam } = await searchParams;
  const students = await getGuardianStudents();

  const student = studentParam
    ? (students.find((s) => s.student_id === studentParam) ?? null)
    : (students.length === 1 ? students[0] : null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-6 bg-bg p-6 text-text">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gold-hi">เป้าหมายรายสัปดาห์</h1>
      </div>

      {students.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-text2">
          ยังไม่มีนักเรียนที่ลิงก์บัญชี — ไปหน้า{" "}
          <Link href="/guardian/link" className="text-gold-hi underline">
            เชื่อมบัญชีนักเรียน
          </Link>{" "}
          ก่อน
        </div>
      )}

      {students.length > 1 && !student && (
        <div className="rounded-xl border border-border bg-card p-4">
          <StudentPicker
            students={students}
            heading="เลือกนักเรียน"
            hrefFor={(id) => `/guardian/goal?student=${id}`}
          />
        </div>
      )}

      {student && <GoalPanel studentId={student.student_id} studentUsername={student.username} />}
    </main>
  );
}
