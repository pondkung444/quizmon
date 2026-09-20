import { redirect } from "next/navigation";
import { getSelfServeAccess, getSelfServeStudent } from "@/lib/selfServe";
import GoalPanel from "@/app/guardian/[studentId]/goal/GoalPanel";

export const dynamic = "force-dynamic";

export default async function MyPlanGoalPage() {
  const access = await getSelfServeAccess();
  if (access.status !== "ok") redirect("/");
  const { studentId, username } = await getSelfServeStudent(access.userId);

  return <GoalPanel studentId={studentId} studentUsername={username} viewerMode="self" />;
}
