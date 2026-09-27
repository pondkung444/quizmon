import { redirect } from "next/navigation";
import { getSelfServeAccess, getSelfServeStudent } from "@/lib/selfServe";
import { createClient } from "@/lib/supabase/server";
import PlanWizard from "@/app/guardian/[studentId]/plan/PlanWizard";

export const dynamic = "force-dynamic";

export default async function MyPlanPlanPage() {
  const access = await getSelfServeAccess();
  // ไม่มีสิทธิ์ → หน้าปลดล็อก (defense-in-depth — layout.tsx เช็ค junior + สิทธิ์ไว้แล้ว)
  if (access.status !== "ok") redirect(access.status === "unauthenticated" ? "/" : "/premium");
  const { studentId, username } = await getSelfServeStudent(access.userId);

  // แผน active ที่ผู้ปกครองสร้าง (guardian_id ไม่ใช่ null) → นักเรียนดูได้อย่างเดียว
  // แผนที่นักเรียนสร้างเองเก็บ guardian_id = NULL (RLS guardian_plan_select_linked ให้นักเรียนอ่านแผนตัวเองได้)
  const supabase = await createClient();
  const { data: activePlan } = await supabase
    .from("guardian_plan")
    .select("guardian_id")
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  return (
    <PlanWizard
      studentId={studentId}
      studentUsername={username}
      viewerMode="self"
      managedByGuardian={!!activePlan?.guardian_id && activePlan.guardian_id !== studentId}
    />
  );
}
