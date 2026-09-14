import { redirect } from "next/navigation";
import { getGuardianAccess } from "@/lib/guardian";
import GuardianLinkForm from "./GuardianLinkForm";

export const dynamic = "force-dynamic";

export default async function GuardianLinkPage() {
  const access = await getGuardianAccess();
  if (access.status !== "ok") {
    redirect("/guardian");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center gap-6 bg-bg p-6 text-text">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gold-hi">เชื่อมบัญชีนักเรียน</h1>
        <p className="mt-1 text-sm text-text3">กรอกรหัสเชิญ 8 หลักที่ได้จากลูกของคุณ</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <GuardianLinkForm />
      </div>
    </main>
  );
}
