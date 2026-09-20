import Link from "next/link";
import { ChevronRight, Route } from "lucide-react";
import { getSelfServeAccess } from "@/lib/selfServe";
import { getGradeBand } from "@/lib/gradeBand";

// การ์ด "แผนของฉัน" บนหน้าแรก (/pet) — โผล่เฉพาะนักเรียนที่มี self_serve_enrollment active + ยังไม่หมดอายุ
// (pilot: ปอนด์ enroll ผ่าน SQL) และเป็น junior (v1) — ไม่เข้าเงื่อนไข = render null เลย ไม่มี placeholder/disabled
// slot นี้คือที่ที่จะกลายเป็น CTA สมัครพรีเมี่ยมตอน public launch
export default async function SelfServePlanCard() {
  const access = await getSelfServeAccess();
  if (access.status !== "ok") return null;
  if ((await getGradeBand(access.userId)) !== "junior") return null;

  return (
    <Link
      href="/my-plan"
      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-gold-dim"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Route className="h-5 w-5 shrink-0 text-mint" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gold-hi">แผนของฉัน</p>
          <p className="text-xs text-text3">ดูแผนฝึก เป้าหมาย และความก้าวหน้าของคุณ</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-text3" />
    </Link>
  );
}
