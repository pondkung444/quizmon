import { redirect } from "next/navigation";
import { getSelfServeAccess, getSelfServeStudent } from "@/lib/selfServe";
import PlanWizard from "@/app/guardian/[studentId]/plan/PlanWizard";

export const dynamic = "force-dynamic";

export default async function MyPlanPlanPage() {
  const access = await getSelfServeAccess();
  if (access.status !== "ok") redirect("/");
  const { studentId, username } = await getSelfServeStudent(access.userId);

  return <PlanWizard studentId={studentId} studentUsername={username} viewerMode="self" />;
}
