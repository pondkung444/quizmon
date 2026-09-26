import { redirect } from "next/navigation";
import { getSelfServeAccess } from "@/lib/selfServe";
import GuardianReportPage from "@/app/guardian/[studentId]/report/page";

export const dynamic = "force-dynamic";

// รายงานไม่มี copy บุรุษที่ 3 (ChapterCompare/หัวข้อเป็นกลาง) เลย reuse page ของ guardian ตรงๆ ไม่ต้องมี viewerMode —
// แค่ส่ง studentId ของตัวเองผ่าน params ให้ตรงกับ signature เดิม
export default async function MyPlanReportPage() {
  const access = await getSelfServeAccess();
  // ไม่มีสิทธิ์ → หน้าปลดล็อก (defense-in-depth — layout.tsx เช็ค junior + สิทธิ์ไว้แล้ว)
  if (access.status !== "ok") redirect(access.status === "unauthenticated" ? "/" : "/premium");

  return <GuardianReportPage params={Promise.resolve({ studentId: access.userId })} />;
}
