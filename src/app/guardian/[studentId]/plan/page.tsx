import { getGuardianStudents } from "@/lib/guardian";
import PlanWizard from "./PlanWizard";

export const dynamic = "force-dynamic";

export default async function GuardianPlanPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  // access + ความเป็นเจ้าของ studentId เช็คแล้วที่ layout.tsx ของ [studentId] — เชื่อ params ได้เลย
  const { studentId } = await params;
  const students = await getGuardianStudents();
  const student = students.find((s) => s.student_id === studentId)!;

  return <PlanWizard studentId={student.student_id} studentUsername={student.username} />;
}
