import { redirect } from "next/navigation";
import Link from "next/link";
import FactoryOfficeLayerTest from "@/components/factoryOffice/FactoryOfficeLayerTest";
import FactoryOperationalHealthPanel from "@/components/factoryOffice/FactoryOperationalHealthPanel";
import { getUser } from "@/lib/supabase/server";
import { loadFactoryOfficeSnapshot } from "@/lib/questionFactory/officeServer";
import FactoryRunControls from "@/components/factoryOffice/FactoryRunControls";

export default async function FactoryOfficePreviewPage() {
  const user = await getUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user?.email || !adminEmails.includes(user.email.toLowerCase())) {
    redirect("/");
  }

  const snapshot = await loadFactoryOfficeSnapshot();

  return (
    <main className="mx-auto min-h-screen max-w-[1440px] space-y-5 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Question Factory</p>
          <h1 className="mt-1 text-2xl font-bold text-text">ศูนย์ควบคุมการผลิตข้อสอบ</h1>
          <p className="mt-1 max-w-2xl text-sm text-text2">ดูความคืบหน้า ตรวจงานที่รออนุมัติ และติดตามข้อสอบที่พร้อมใช้งาน</p>
        </div>
        <Link href="/admin/question-factory/review" className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-600">
          เปิดคิวตรวจข้อสอบ
        </Link>
      </header>
      {snapshot.source === "live" && <FactoryOperationalHealthPanel health={snapshot.health} controls={snapshot.controls} />}
      {snapshot.source === "live" && ["created", "running", "paused"].includes(snapshot.run.status) && <FactoryRunControls run={snapshot.run} />}
      <FactoryOfficeLayerTest snapshot={snapshot} />
    </main>
  );
}
