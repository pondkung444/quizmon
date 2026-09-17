import { redirect } from "next/navigation";
import { getGuardianAccess, getGuardianStudents } from "@/lib/guardian";
import GuardianShell from "@/components/guardian/GuardianShell";

export const dynamic = "force-dynamic";

// ครอบทั้ง 3 หน้าย่อย (ภาพรวม/แผนฝึก/เป้าหมาย) — เช็ค access + หา student ที่จุดเดียว แทนที่แต่ละ
// หน้าเช็คเองซ้ำแบบเดิม ถ้า studentId ไม่ถูกต้อง/ไม่ใช่ของผู้ปกครองคนนี้ redirect กลับ /guardian
// ทันทีที่ layout เลย หน้าลูกไม่ต้องกันซ้ำอีก
export default async function GuardianStudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    redirect("/guardian");
  }

  return (
    <GuardianShell
      studentId={studentId}
      studentUsername={student.username}
      students={students}
      displayName={access.displayName}
    >
      {children}
    </GuardianShell>
  );
}
