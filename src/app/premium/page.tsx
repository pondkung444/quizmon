import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ChevronLeft, Crown, Gift, Route, Zap } from "lucide-react";
import { getPremiumStatus } from "@/lib/selfServe";
import { getGradeBand } from "@/lib/gradeBand";
import {
  FREE_DAILY_EXP_CAP,
  PREMIUM_DAILY_EXP_CAP,
  PREMIUM_PRICE_BAHT,
  PREMIUM_DAYS,
  PREMIUM_RENEW_WARN_DAYS,
  daysToFullGrowth,
  getPremiumHeroImage,
  premiumDaysLeft,
} from "@/lib/premium";
import PremiumCtaButtons from "./PremiumCtaButtons";

export const dynamic = "force-dynamic";

const EGG_IMAGE = "/pets/egg6_stage1_egg.png";
const FRAME_PREVIEW_AVATAR = "/pets/egg1_stage2_baby.png";
const FRAME_TIERS = [
  { src: "/frame/frame_guardian_basic.png", alt: "กรอบพื้นฐาน", label: "ขั้น 1", hint: "ได้ทันที", current: true },
  { src: "/frame/frame_guardian_mid.png", alt: "กรอบระดับกลาง", label: "ขั้น 2", hint: "ทำเป้าสำเร็จ 4 สัปดาห์", current: false },
  { src: "/frame/frame_guardian_special.png", alt: "กรอบพิเศษ", label: "ขั้น 3", hint: "ทำแผนจนจบ", current: false },
];
// ตัวอย่างคิวบทในการ์ด "แผนของฉัน" — ภาพประกอบเท่านั้น ไม่ใช่แผนจริงของผู้ใช้
const SAMPLE_PLAN = [
  { name: "สถิติเบื้องต้น", done: true },
  { name: "กราฟของฟังก์ชันกำลังสอง", done: true },
  { name: "การแยกตัวประกอบ", done: false },
];

// หน้าปลดล็อกพรีเมียม (phase 3b) — gate เดียวกับ /my-plan: junior เท่านั้นในรอบนี้ (v1)
// senior → กลับหน้าแรก เพราะแผนของฉันยังไม่รองรับ senior (current chapter ยังไม่ branch-aware)
// มีสิทธิ์อยู่ + เหลือ > PREMIUM_RENEW_WARN_DAYS วัน → ข้อความ "มีสิทธิ์อยู่แล้ว" + ลิงก์ /my-plan แทนฟอร์มจ่ายเงิน
// (กันจ่ายซ้ำตอน Stripe เปิด) ส่วนคนที่ใกล้หมด (≤ 7 วัน) เห็นหน้าเต็มเพื่อต่ออายุ — ปุ่ม "ต่ออายุ" บนการ์ด /pet พามาที่นี่
export default async function PremiumPage() {
  const premium = await getPremiumStatus();
  if (premium.status === "unauthenticated") redirect("/");
  if ((await getGradeBand(premium.userId)) !== "junior") redirect("/");

  const daysLeft = premium.status === "active" ? premiumDaysLeft(premium.expiresAt) : null;

  if (premium.status === "active" && daysLeft !== null && daysLeft > PREMIUM_RENEW_WARN_DAYS) {
    const until = new Date(premium.expiresAt).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    });
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 p-4 pb-24">
        <PremiumHeader />
        <div className="flex flex-col items-center gap-3 rounded-[22px] border border-border bg-card p-6 text-center">
          <PremiumBadge />
          <p className="text-lg font-bold text-text">เธอเป็นพรีเมียมอยู่แล้ว</p>
          <p className="text-sm text-text2">
            ใช้ได้ถึง {until} (อีก {daysLeft} วัน)
            <br />
            ต่ออายุได้เมื่อเหลือไม่เกิน {PREMIUM_RENEW_WARN_DAYS} วัน
          </p>
          <Link
            href="/my-plan"
            className="mt-1 flex min-h-11 w-full items-center justify-center rounded-2xl bg-(--hero-cta-bg) px-4 py-3 text-base font-bold text-(--hero-cta-text) shadow-[0_4px_0_var(--hero-cta-shadow)]"
          >
            ไปที่แผนของฉัน
          </Link>
        </div>
      </main>
    );
  }

  const heroImage = await getPremiumHeroImage(premium.userId);
  const freeDays = daysToFullGrowth(FREE_DAILY_EXP_CAP);
  const premiumDays = daysToFullGrowth(PREMIUM_DAILY_EXP_CAP);
  const months = Math.round(PREMIUM_DAYS / 30);
  const perDay = Math.round(PREMIUM_PRICE_BAHT / PREMIUM_DAYS);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 p-4 pb-24">
      <PremiumHeader />

      {daysLeft !== null && (
        <div className="rounded-2xl border border-amber bg-amber/15 px-4 py-3 text-sm text-text">
          พรีเมียมเหลืออีก <b className="text-gold">{daysLeft} วัน</b> — ต่ออายุตอนนี้ วันที่เหลือจะบวกต่อท้ายให้
        </div>
      )}

      {/* hero */}
      <section className="relative flex flex-col items-center gap-1.5 overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#3b2a7a_0%,#6a3fa0_55%,#e0729a_100%)] px-5 pt-[22px] pb-5">
        <span className="absolute top-7 left-[9%] h-1 w-1 rounded-full bg-[#fff4a8]" />
        <span className="absolute top-[70px] right-[14%] h-[5px] w-[5px] rounded-full bg-[#fff4a8]" />
        <span className="absolute top-[140px] left-[6%] h-[3px] w-[3px] rounded-full bg-white" />
        <span className="absolute top-10 right-[28%] h-[3px] w-[3px] rounded-full bg-white" />
        <PremiumBadge />
        <div className="relative flex h-[230px] w-[250px] items-end justify-center">
          <div className="absolute bottom-2 left-[45px] h-[26px] w-40 rounded-[50%] bg-indigo shadow-[0_0_36px_10px_rgba(143,124,255,0.8)]" />
          <Image
            src={heroImage}
            alt="Qmon ร่างสมบูรณ์"
            width={240}
            height={240}
            priority
            className="relative h-60 w-60 object-contain"
          />
        </div>
        <h1 className="mt-1 text-center text-[27px] leading-tight font-bold text-white">
          ให้ Qmon ของเธอ
          <br />
          โตไวขึ้น พร้อมแผนฝึกของตัวเอง
        </h1>
        <p className="text-center text-sm leading-normal text-white/90">
          ปลดล็อก 2 พลังพิเศษ ใช้ได้ต่อเนื่อง {months} เดือนเต็ม
          <br />
          พร้อมของขวัญต้อนรับอีก 2 ชิ้น
        </p>
      </section>

      {/* ของขวัญต้อนรับ */}
      <section className="rounded-3xl bg-[linear-gradient(135deg,#ffe08a,#ff9f43)] p-0.5">
        <div className="flex flex-col gap-3.5 rounded-[22px] bg-card p-[18px]">
          <SectionHeading
            icon={<Gift className="h-6 w-6 text-[#2a1300]" />}
            iconBg="bg-[#ff9f43]"
            kicker="ของขวัญต้อนรับ · ได้รับทันที"
            kickerClass="text-gold-hi"
            title="ปลดล็อกแล้วรับเลย 2 ชิ้น"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <GiftTile
              art={
                <div className="relative flex h-[118px] w-[110px] items-center justify-center">
                  <div className="absolute h-[90px] w-[90px] rounded-full bg-[rgba(255,159,67,0.35)] shadow-[0_0_30px_8px_rgba(255,159,67,0.45)]" />
                  <Image src={EGG_IMAGE} alt="ไข่ศักดิ์ธรา" width={104} height={104} className="relative h-[104px] w-[104px] object-contain" />
                </div>
              }
              tag="ระดับสุดยอด"
              name="ไข่ศักดิ์ธรา"
              desc="Qmon สายแกร่ง ถึกทน ยืนหยัดได้นาน"
            />
            <GiftTile
              art={
                <div className="relative h-[118px] w-[118px]">
                  <Image
                    src={FRAME_PREVIEW_AVATAR}
                    alt=""
                    width={78}
                    height={78}
                    className="absolute top-5 left-5 h-[78px] w-[78px] rounded-[10px] bg-(--quiz-label-bg) object-contain"
                  />
                  <Image
                    src={FRAME_TIERS[0].src}
                    alt={FRAME_TIERS[0].alt}
                    width={118}
                    height={118}
                    className="absolute inset-0 h-[118px] w-[118px] object-contain"
                  />
                </div>
              }
              tag="กรอบขั้นแรก"
              name="กรอบโปรไฟล์"
              desc="ฝึกต่อ อัปเกรดได้อีก 2 ขั้น"
            />
          </div>
          <p className="text-center text-xs text-text2">ของขวัญเป็นของเธอตลอดไป แม้ครบ {months} เดือนแล้ว</p>
        </div>
      </section>

      {/* พลังพิเศษ 1: เพดาน EXP รายวัน */}
      <section className="flex flex-col gap-3.5 rounded-[22px] border border-border bg-card p-[18px]">
        <SectionHeading
          icon={<Zap className="h-6 w-6 text-[#2a1300]" />}
          iconBg="bg-[#ffd166]"
          kicker="พลังพิเศษ 1"
          kickerClass="text-gold"
          title={`พลังวันนี้ ${PREMIUM_DAILY_EXP_CAP} แต้ม`}
        />
        <div className="flex flex-col gap-2.5">
          <CapBar
            label="ปกติ"
            value={FREE_DAILY_EXP_CAP}
            pct={(FREE_DAILY_EXP_CAP / PREMIUM_DAILY_EXP_CAP) * 100}
            fillClass="bg-indigo-dim"
          />
          <CapBar
            label="พรีเมียม"
            value={PREMIUM_DAILY_EXP_CAP}
            pct={100}
            fillClass="bg-[linear-gradient(90deg,#ffd166,#ff9f43)]"
            highlight
          />
        </div>
        <div className="flex flex-col gap-2.5 rounded-2xl bg-(--gd-row-bg) p-3.5">
          <p className="text-sm leading-normal text-text2">ตอบได้มากขึ้นทุกวัน Qmon โตเต็มวัยเร็วสุดใน</p>
          <div className="flex items-center gap-2.5">
            <div className="flex gap-[5px]">
              {Array.from({ length: premiumDays }, (_, i) => (
                <span key={i} className="h-[22px] w-[22px] rounded-full bg-gold" />
              ))}
            </div>
            <span className="text-[22px] font-bold text-gold-hi">{premiumDays} วัน</span>
            <span className="text-[13px] text-text3">จากปกติ {freeDays} วัน</span>
          </div>
        </div>
      </section>

      {/* พลังพิเศษ 2: แผนของฉัน */}
      <section className="flex flex-col gap-3.5 rounded-[22px] border border-border bg-card p-[18px]">
        <SectionHeading
          icon={<Route className="h-6 w-6 text-[#10231d]" />}
          iconBg="bg-[#a0e0c9]"
          kicker="พลังพิเศษ 2"
          kickerClass="text-mint"
          title="แผนของฉัน"
        />
        <p className="text-sm leading-relaxed text-text2">เลือกบทที่อยากเก่ง แล้วให้เกมพาฝึกทีละบทจนผ่าน</p>
        <div className="flex flex-col gap-2 rounded-2xl bg-(--gd-row-bg) p-3">
          {SAMPLE_PLAN.map((ch) =>
            ch.done ? (
              <div key={ch.name} className="flex items-center gap-2.5 rounded-xl bg-card px-3 py-2.5">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#a0e0c9]">
                  <Check className="h-[13px] w-[13px] text-[#10231d]" strokeWidth={3} />
                </span>
                <span className="text-sm text-text2">{ch.name}</span>
              </div>
            ) : (
              <div
                key={ch.name}
                className="flex items-center gap-2.5 rounded-xl border border-indigo bg-(--quiz-label-bg) px-3 py-2.5"
              >
                <span className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-gold" />
                <span className="grow text-sm font-semibold text-text">{ch.name}</span>
                <span className="rounded-full bg-gold px-2 py-[3px] text-[11px] font-semibold text-on-amber">กำลังฝึก</span>
              </div>
            )
          )}
        </div>
        <ul className="flex flex-col gap-2">
          {["โหมดฝึกดึงข้อจากบทที่กำลังฝึกให้ครึ่งหนึ่งอัตโนมัติ", "ตั้งเป้ารายสัปดาห์ และดูรายงานว่าเก่งขึ้นตรงไหน"].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-sm leading-normal text-text2">
              <Check className="mt-[3px] h-4 w-4 shrink-0 text-mint" strokeWidth={2.4} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(255,159,67,0.45)] bg-[rgba(255,159,67,0.12)] px-3 py-2.5">
          <Image src={EGG_IMAGE} alt="" width={48} height={48} className="h-12 w-12 shrink-0 object-contain" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-bold text-text">ทำตามแผนสำเร็จ รับไข่ศักดิ์ธราอีก</p>
            <p className="text-xs text-gold-hi">ทุก 2 สัปดาห์ ตลอดที่เป็นพรีเมียม</p>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-text">กรอบโปรไฟล์ อัปเกรดตามความพยายาม</p>
          <div className="grid grid-cols-3 gap-2">
            {FRAME_TIERS.map((f) => (
              <div
                key={f.src}
                className={`flex flex-col items-center gap-1 rounded-[14px] border bg-(--gd-row-bg) px-1.5 pt-2 pb-2.5 ${
                  f.current ? "border-gold" : "border-border"
                }`}
              >
                <Image src={f.src} alt={f.alt} width={72} height={72} className="h-[72px] w-[72px] object-contain" />
                <span className="text-xs font-semibold text-text">{f.label}</span>
                <span className={`text-center text-[11px] leading-snug ${f.current ? "text-gold-hi" : "text-text3"}`}>
                  {f.hint}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ราคา + CTA */}
      <section className="rounded-3xl bg-[linear-gradient(135deg,#ffd166,#ff6b8b)] p-0.5">
        <div className="flex flex-col gap-3.5 rounded-[22px] bg-card px-[18px] pt-5 pb-[18px]">
          <div className="flex items-end justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[44px] leading-none font-bold text-text">฿{PREMIUM_PRICE_BAHT}</span>
              <span className="text-[15px] text-text2">/ {months} เดือน</span>
            </div>
            <span className="rounded-full bg-gold px-2.5 py-1 text-xs font-semibold text-on-amber">ตกวันละ ~{perDay} บาท</span>
          </div>
          <ul className="flex flex-col gap-1.5 text-[13px] leading-normal text-text2">
            {["จ่ายครั้งเดียวต่อรอบ ไม่มีตัดเงินอัตโนมัติ", "ใช้ได้ทันทีหลังจ่าย", "รับไข่ศักดิ์ธรา + กรอบโปรไฟล์ทันที"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-[15px] w-[15px] shrink-0 text-gold-hi" strokeWidth={2.4} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <PremiumCtaButtons />
          <div className="flex items-center justify-center gap-2 text-xs text-text3">
            <span className="rounded-md bg-white px-2 py-[3px] text-[11px] font-bold text-[#0a3c7d]">PromptPay</span>
            <span>สแกนจ่ายผ่านแอปธนาคาร</span>
          </div>
        </div>
      </section>

      {/* ก่อนจ่าย อ่านสักนิด */}
      <section className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-card/40 p-4 font-sarabun">
        <p className="font-sans text-sm font-semibold text-text">ก่อนจ่าย อ่านสักนิด</p>
        <FinePrint>
          ตอนสแกน ชื่อผู้รับเงินจะขึ้นว่า <b className="text-text">STRIPE PAYMENTS (THAILAND) LTD</b> ซึ่งเป็นระบบรับเงินของ QuizMon
        </FinePrint>
        <FinePrint>ต่ออายุก่อนหมดได้ วันที่เหลือจะไม่หาย ระบบบวกต่อท้ายให้</FinePrint>
        <FinePrint>
          ครบ {months} เดือนแล้ว EXP และร่างของ Qmon ยังอยู่ครบทุกอย่าง แผนของฉันจะพักไว้ ต่ออายุเมื่อไรก็กลับมาใช้ต่อได้ทันที
        </FinePrint>
        <FinePrint>
          ไม่มีการคืนเงิน ยกเว้นระบบผิดพลาด เช่น จ่ายซ้ำ หรือจ่ายแล้วไม่ปลดล็อก <b className="text-gold-hi">ติดต่อครูปอนด์</b>
        </FinePrint>
      </section>
    </main>
  );
}

function PremiumHeader() {
  return (
    <div className="flex h-11 items-center justify-between">
      <Link
        href="/pet"
        aria-label="กลับไปหน้า Qmon"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-text/10 text-text2"
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
      </Link>
      <span className="text-[13px] font-medium text-text3">พรีเมียม</span>
      <div className="w-11" />
    </div>
  );
}

function PremiumBadge() {
  return (
    <span className="relative flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-[5px] text-xs font-bold tracking-wider text-[#4b3aa0]">
      <Crown className="h-3.5 w-3.5 text-[#c98a00]" strokeWidth={2.4} />
      PREMIUM
    </span>
  );
}

function SectionHeading({
  icon,
  iconBg,
  kicker,
  kickerClass,
  title,
}: {
  icon: React.ReactNode;
  iconBg: string;
  kicker: string;
  kickerClass: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${iconBg}`}>{icon}</div>
      <div className="flex flex-col gap-0.5">
        <p className={`text-xs font-semibold tracking-wide ${kickerClass}`}>{kicker}</p>
        <p className="text-[19px] font-bold text-text">{title}</p>
      </div>
    </div>
  );
}

function GiftTile({ art, tag, name, desc }: { art: React.ReactNode; tag: string; name: string; desc: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[18px] border border-gold-dim bg-(--gd-row-bg) px-2.5 pt-3.5 pb-3">
      {art}
      <span className="rounded-full bg-[#ffe08a] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#2a1300]">{tag}</span>
      <p className="text-base font-bold text-text">{name}</p>
      <p className="text-center text-xs leading-snug text-text3">{desc}</p>
    </div>
  );
}

function CapBar({
  label,
  value,
  pct,
  fillClass,
  highlight = false,
}: {
  label: string;
  value: number;
  pct: number;
  fillClass: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className={`flex justify-between text-[13px] ${highlight ? "font-semibold text-text" : "text-text3"}`}>
        <span>{label}</span>
        <span className={highlight ? "text-gold-hi" : undefined}>{value} / วัน</span>
      </div>
      <div className="h-3 overflow-hidden rounded-md bg-track">
        <div className={`h-3 rounded-md ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FinePrint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px] leading-relaxed text-text2">
      <span className="text-gold">•</span>
      <span>{children}</span>
    </div>
  );
}
