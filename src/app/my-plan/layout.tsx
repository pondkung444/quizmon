import { redirect } from "next/navigation";
import { getSelfServeAccess } from "@/lib/selfServe";
import { getGradeBand } from "@/lib/gradeBand";
import GuardianShell from "@/components/guardian/GuardianShell";
import AppThemeMarker from "@/components/AppThemeMarker";

export const dynamic = "force-dynamic";

// แผนของนักเรียน self-serve (พรีเมียม) — เช็ค access ที่จุดเดียวที่ layout เหมือน /guardian/[studentId]/layout.tsx
// junior เท่านั้นในรอบนี้: current chapter ของ senior ยังไม่ branch-aware (follow-up ที่รู้กันอยู่แล้ว)
// → senior กลับหน้าแรกเสมอ (พรีเมียมก็ยังไม่รองรับ senior พาไปหน้าปลดล็อกก็ไม่มีประโยชน์)
// junior ที่ไม่มีสิทธิ์ (ไม่เคยซื้อ/หมดอายุ) → หน้าปลดล็อก /premium
export default async function MyPlanLayout({ children }: { children: React.ReactNode }) {
  const access = await getSelfServeAccess();
  if (access.status === "unauthenticated") {
    redirect("/");
  }

  const band = await getGradeBand(access.userId);
  if (band !== "junior") {
    redirect("/");
  }
  if (access.status !== "ok") {
    redirect("/premium");
  }

  // ธีมแอปเฉพาะฝั่งนักเรียน (/my-plan) — หน้า /guardian ใช้ component ชุดเดียวกันแต่ไม่มีป้ายนี้ จึงคงโทนเดิม
  return (
    <>
      <AppThemeMarker />
      <GuardianShell
        viewerMode="self"
        studentId={access.userId}
        studentUsername=""
        students={[]}
        displayName={null}
      >
        {children}
      </GuardianShell>
    </>
  );
}
