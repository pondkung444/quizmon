import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Route } from "lucide-react";
import { getPremiumStatus } from "@/lib/selfServe";
import { getGradeBand } from "@/lib/gradeBand";
import {
  PREMIUM_DAILY_EXP_CAP,
  PREMIUM_PRICE_BAHT,
  PREMIUM_RENEW_WARN_DAYS,
  getPremiumHeroImage,
  premiumDaysLeft,
} from "@/lib/premium";

// การ์ดพรีเมียมบนหน้าแรก (/pet) — junior ทุกคนเห็นการ์ดใดการ์ดหนึ่งใน 3 สถานะเสมอ:
//   1) ไม่มีสิทธิ์ (ไม่เคย enroll / หมดอายุแล้ว) → CTA "ปลดล็อกพรีเมียม" ลิงก์ไป /premium
//   2) มีสิทธิ์ เหลือ > PREMIUM_RENEW_WARN_DAYS วัน → การ์ด "แผนของฉัน" + badge PREMIUM ลิงก์ไป /my-plan
//   3) มีสิทธิ์ เหลือ ≤ PREMIUM_RENEW_WARN_DAYS วัน → การ์ดแบบ 2 + แถบเตือนสีส้ม "ต่ออายุ" ลิงก์ไป /premium
// senior → render null (v1 ยังไม่รองรับ: current chapter ของแผนยังไม่ branch-aware)
export default async function SelfServePlanCard() {
  const premium = await getPremiumStatus();
  if (premium.status === "unauthenticated") return null;
  if ((await getGradeBand(premium.userId)) !== "junior") return null;

  if (premium.status === "none") {
    const heroImage = await getPremiumHeroImage(premium.userId);
    return (
      <Link
        href="/premium"
        className="block rounded-[22px] bg-[linear-gradient(135deg,#ffd166,#ff6b8b)] p-0.5 transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 rounded-[20px] bg-[linear-gradient(135deg,#3b2a7a_0%,#6a3fa0_100%)] px-4 py-3.5">
          <Image src={heroImage} alt="" width={64} height={64} className="h-16 w-16 shrink-0 object-contain" />
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-white">ปลดล็อกพรีเมียม</span>
              <span className="rounded-full bg-[#ffe08a] px-[7px] py-0.5 text-[10px] font-bold tracking-wide text-[#4b3aa0]">
                NEW
              </span>
            </div>
            <span className="text-[13px] leading-snug text-white/90">
              พลังวันละ {PREMIUM_DAILY_EXP_CAP} + แผนของฉัน + ไข่ศักดิ์ธรา
            </span>
            <span className="text-xs font-semibold text-[#ffe08a]">฿{PREMIUM_PRICE_BAHT} / 3 เดือน</span>
          </div>
          <ChevronRight className="h-[22px] w-[22px] shrink-0 text-white" />
        </div>
      </Link>
    );
  }

  const daysLeft = premiumDaysLeft(premium.expiresAt);
  const expiringSoon = daysLeft <= PREMIUM_RENEW_WARN_DAYS;

  const planLink = (
    <Link href="/my-plan" className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint">
        <Route className="h-[22px] w-[22px] text-[#10231d]" />
      </div>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-gold-hi">แผนของฉัน</span>
          <span className="rounded-full bg-gold px-[7px] py-0.5 text-[10px] font-bold tracking-wide text-on-amber">
            PREMIUM
          </span>
        </div>
        <span className="text-xs text-text3">ดูแผนฝึก เป้าหมาย และความก้าวหน้าของคุณ</span>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-text3" />
    </Link>
  );

  if (!expiringSoon) {
    return <div className="rounded-[20px] border border-border bg-card p-4 transition hover:border-gold-dim">{planLink}</div>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-amber bg-card p-4">
      {planLink}
      <Link
        href="/premium"
        className="flex items-center justify-between gap-2.5 rounded-[14px] bg-amber/15 px-3 py-2.5"
      >
        <span className="text-[13px] text-text">
          พรีเมียมเหลืออีก <b className="text-gold">{daysLeft} วัน</b>
        </span>
        <span className="rounded-full bg-amber px-3 py-1.5 text-[13px] font-bold text-on-amber">ต่ออายุ</span>
      </Link>
    </div>
  );
}
