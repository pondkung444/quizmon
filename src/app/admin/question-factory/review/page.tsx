import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import FactoryReviewQueue from "@/components/factoryReview/FactoryReviewQueue";
import { loadFactoryReviewQueue } from "@/lib/questionFactory/reviewQueueServer";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function QuestionFactoryReviewPage() {
  const user = await getUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !adminEmails.includes(user.email.toLowerCase())) redirect("/");

  const items = await loadFactoryReviewQueue();
  return (
    <main className="mx-auto min-h-screen max-w-[1440px] space-y-5 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Question Factory v1</p>
          <h1 className="mt-1 text-2xl font-bold text-text">ตรวจข้อสอบก่อนเผยแพร่</h1>
          <p className="mt-1 max-w-3xl text-sm text-text2">
            เปิดดูทีละข้อ สุ่มจากคิว หรือเลือกหลายข้อเพื่ออนุมัติพร้อมกัน พร้อมสร้าง Draft โปรโมตภาพ และตรวจสถานะก่อน Activation
          </p>
        </div>
        <Link
          href="/admin/factory-office-preview"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold text-text2 transition hover:border-gold-dim hover:text-gold-hi"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          กลับไปโรงงาน
        </Link>
      </header>
      <FactoryReviewQueue items={items} />
    </main>
  );
}
