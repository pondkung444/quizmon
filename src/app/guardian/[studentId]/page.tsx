import Link from "next/link";
import { redirect } from "next/navigation";
import { getGuardianAccess, getGuardianStudents } from "@/lib/guardian";
import StudentOverview from "./overview/StudentOverview";

export const dynamic = "force-dynamic";

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

  return <StudentOverview studentId={studentId} studentUsername={student.username} />;
}
