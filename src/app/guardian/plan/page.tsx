import { redirect } from "next/navigation";
import { getGuardianAccess } from "@/lib/guardian";
import { createClient } from "@/lib/supabase/server";
import PlanWizard from "./PlanWizard";

export const dynamic = "force-dynamic";

export default async function GuardianPlanPage() {
  const access = await getGuardianAccess();
  if (access.status !== "ok") {
    redirect("/guardian");
  }

  const supabase = await createClient();
  const { data: students } = await supabase.rpc("guardian_get_students");
  const student = students?.[0] ?? null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col gap-6 bg-bg p-6 text-text">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gold-hi">แผนฝึก (ทดสอบ)</h1>
        <p className="mt-1 text-sm text-text3">
          หน้าทดสอบ RPC ของ Module C — ไม่ใช่ดีไซน์จริง
        </p>
      </div>

      {!student && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-text2">
          ยังไม่มีนักเรียนที่ลิงก์บัญชี — ไปหน้า{" "}
          <a href="/guardian/link" className="text-gold-hi underline">
            เชื่อมบัญชีนักเรียน
          </a>{" "}
          ก่อน
        </div>
      )}

      {student && <PlanWizard studentId={student.student_id} studentUsername={student.username} />}
    </main>
  );
}
