import { redirect } from "next/navigation";
import { getSelfServeAccess } from "@/lib/selfServe";
import { getGradeBand } from "@/lib/gradeBand";
import GuardianShell from "@/components/guardian/GuardianShell";

export const dynamic = "force-dynamic";

// แผนของนักเรียน self-serve pilot — เช็ค access ที่จุดเดียวที่ layout เหมือน /guardian/[studentId]/layout.tsx
// ไม่มี "หน้า landing" ให้เด้งไป (ไม่มี UI ขอเข้าร่วม — ปอนด์ enroll ผ่าน SQL) จึง redirect กลับหน้าแรกเมื่อไม่ได้ enroll
// junior เท่านั้นในรอบนี้: current chapter ของ senior ยังไม่ branch-aware (follow-up ที่รู้กันอยู่แล้ว)
export default async function MyPlanLayout({ children }: { children: React.ReactNode }) {
  const access = await getSelfServeAccess();
  if (access.status !== "ok") {
    redirect("/");
  }

  const band = await getGradeBand(access.userId);
  if (band !== "junior") {
    redirect("/");
  }

  return (
    <GuardianShell
      viewerMode="self"
      studentId={access.userId}
      studentUsername=""
      students={[]}
      displayName={null}
    >
      {children}
    </GuardianShell>
  );
}
