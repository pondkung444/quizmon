import { getGuardianStudents } from "@/lib/guardian";
import { createClient } from "@/lib/supabase/server";
import GoalPanel from "./GoalPanel";
import QuestMessagePanel, { type QuestMessageOptions } from "./QuestMessagePanel";

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

  const supabase = await createClient();
  const { data: opts } = await supabase.rpc("guardian_get_quest_options", { p_student_id: studentId });
  const questOptions: QuestMessageOptions | null =
    opts && Array.isArray(opts.messages)
      ? { currentMessageId: opts.current_message_id ?? null, messages: opts.messages }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <GoalPanel studentId={student.student_id} studentUsername={student.username} />
      {questOptions && <QuestMessagePanel studentId={student.student_id} options={questOptions} />}
    </div>
  );
}
