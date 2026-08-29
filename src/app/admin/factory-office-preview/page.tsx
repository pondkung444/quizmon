import { redirect } from "next/navigation";
import FactoryOfficeLayerTest from "@/components/factoryOffice/FactoryOfficeLayerTest";
import FactoryOperationalHealthPanel from "@/components/factoryOffice/FactoryOperationalHealthPanel";
import { getUser } from "@/lib/supabase/server";
import { loadFactoryOfficeSnapshot } from "@/lib/questionFactory/officeServer";

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
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Question Factory v1</p>
        <h1 className="mt-1 text-2xl font-bold text-text">Factory Office</h1>
        <p className="mt-1 max-w-3xl text-sm text-text2">
          ภาพรวมสถานะการผลิตจาก run, slot และ event ล่าสุด พร้อมโหมด calibration สำหรับตรวจ visual
        </p>
      </header>
      {snapshot.source === "live" && <FactoryOperationalHealthPanel health={snapshot.health} controls={snapshot.controls} />}
      <FactoryOfficeLayerTest snapshot={snapshot} />
    </main>
  );
}
