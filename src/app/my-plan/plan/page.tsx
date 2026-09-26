import { redirect } from "next/navigation";
import { getSelfServeAccess, getSelfServeStudent } from "@/lib/selfServe";
import PlanWizard from "@/app/guardian/[studentId]/plan/PlanWizard";

export const dynamic = "force-dynamic";

export default async function MyPlanPlanPage() {
  const access = await getSelfServeAccess();
  // ไม่มีสิทธิ์ → หน้าปลดล็อก (defense-in-depth — layout.tsx เช็ค junior + สิทธิ์ไว้แล้ว)
  if (access.status !== "ok") redirect(access.status === "unauthenticated" ? "/" : "/premium");
  const { studentId, username } = await getSelfServeStudent(access.userId);

  return <PlanWizard studentId={studentId} studentUsername={username} viewerMode="self" />;
}
