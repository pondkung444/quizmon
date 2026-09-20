import { redirect } from "next/navigation";
import { getSelfServeAccess, getSelfServeStudent } from "@/lib/selfServe";
import StudentOverview from "@/app/guardian/[studentId]/overview/StudentOverview";

export const dynamic = "force-dynamic";

export default async function MyPlanOverviewPage() {
  // access + junior เช็คแล้วที่ layout.tsx — เช็คซ้ำเบาๆ แค่เพื่อให้ได้ userId (getUser ถูก cache ต่อ request)
  const access = await getSelfServeAccess();
  if (access.status !== "ok") redirect("/");
  const { studentId, username } = await getSelfServeStudent(access.userId);

  return <StudentOverview studentId={studentId} studentUsername={username} viewerMode="self" />;
}
