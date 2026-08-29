import Link from "next/link";
import { BarChart3, ClipboardCheck, Factory, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/supabase/server";

const ADMIN_DESTINATIONS = [
  {
    href: "/admin/analytics",
    title: "Analytics",
    description: "ติดตามผู้เล่น การตอบคำถาม retention และบทเรียนที่ต้องดูแล",
    icon: BarChart3,
    accent: "border-indigo/50 bg-indigo-dim/20 text-indigo-hi",
  },
  {
    href: "/admin/factory-office-preview",
    title: "Factory Office",
    description: "ดูสถานะ Run, Slots, workers และ event projection ของ Question Factory",
    icon: Factory,
    accent: "border-gold-dim bg-gold-dim/15 text-gold-hi",
  },
  {
    href: "/admin/question-factory/review",
    title: "Human Review",
    description: "ตรวจ อนุมัติ ส่งกลับแก้ไข และควบคุมการเผยแพร่ข้อสอบ",
    icon: ClipboardCheck,
    accent: "border-emerald-800/60 bg-emerald-950/25 text-emerald-200",
  },
] as const;

export default async function AdminHomePage() {
  const user = await getUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!user?.email || !adminEmails.includes(user.email.toLowerCase())) redirect("/");

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="rounded-3xl border border-gold-dim bg-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-dim/30 text-gold-hi">
            <ShieldCheck size={26} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">QuizMon Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-text sm:text-3xl">ศูนย์รวมงานผู้ดูแล</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text2">
              เลือกพื้นที่ทำงานที่ต้องการ ระบบจะตรวจสิทธิ์ผู้ดูแลซ้ำในทุกหน้าปลายทาง
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3" aria-label="เมนูผู้ดูแล">
        {ADMIN_DESTINATIONS.map(({ href, title, description, icon: Icon, accent }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-3xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-gold-dim hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${accent}`}>
              <Icon size={23} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-lg font-bold text-text transition group-hover:text-gold-hi">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-text2">{description}</p>
            <span className="mt-5 inline-flex text-xs font-semibold text-gold-hi">เปิดพื้นที่ทำงาน →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
