import { getGuardianStudents } from "@/lib/guardian";
import GoalPanel from "./GoalPanel";

export const dynamic = "force-dynamic";

export default async function GuardianGoalPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  // access + ความเป็นเจ้าของ studentId เช็คแล้วที่ layout.tsx ของ [studentId] — เชื่อ params ได้เลย
  const { studentId } = await params;
  const students = await getGuardianStudents();
  const student = students.find((s) => s.student_id === studentId)!;

  return <GoalPanel studentId={student.student_id} studentUsername={student.username} />;
}
