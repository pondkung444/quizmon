import Link from "next/link";
import { ChevronRight, Crown, Loader2 } from "lucide-react";
import { getRecentPremiumOrder, type RecentPremiumOrder } from "@/lib/selfServe";

// แถบสถานะ order ล่าสุด (เฟส 4.1) — แสดงบน /pet และ /premium หลังผู้ใช้กลับจากจ่าย PromptPay
// ข้อมูลมาจาก getRecentPremiumOrder() (DB เท่านั้น) ไม่ poll เอง — pending ลิงก์ไป /premium/success ที่ poll อยู่แล้ว

// ตัวดึงข้อมูลเองสำหรับ /pet (render คู่ขนานกับส่วนอื่นเหมือน SelfServePlanCard)
// /premium ดึง order เองเพราะใช้ตัดสินปุ่มซื้อด้วย แล้วส่งเข้า PremiumOrderBanner ตรงๆ
export async function RecentPremiumOrderBanner({ userId }: { userId: string }) {
  return <PremiumOrderBanner order={await getRecentPremiumOrder(userId)} />;
}

export default function PremiumOrderBanner({ order }: { order: RecentPremiumOrder | null }) {
  if (!order) return null;

  if (order.status === "granted") {
    const until = order.expiresAt
      ? new Date(order.expiresAt).toLocaleDateString("th-TH", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Bangkok",
        })
      : null;
    return (
      <Link
        href="/my-plan"
        className="flex min-h-11 items-center gap-3 rounded-2xl border border-gold bg-gold/15 px-4 py-3"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold">
          <Crown className="h-5 w-5 text-on-amber" strokeWidth={2.4} />
        </span>
        <span className="flex grow flex-col">
          <span className="text-sm font-bold text-text">ปลดล็อกพรีเมียมสำเร็จ!</span>
          {until && <span className="text-xs text-text2">ใช้ได้ถึง {until}</span>}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-text3" />
      </Link>
    );
  }

  return (
    <Link
      href={`/premium/success?order=${order.orderId}`}
      className="flex min-h-11 items-center gap-3 rounded-2xl border border-amber bg-amber/15 px-4 py-3"
    >
      <Loader2 className="h-6 w-6 shrink-0 animate-spin text-gold" />
      <span className="flex grow flex-col">
        <span className="text-sm font-bold text-text">กำลังยืนยันการชำระเงิน</span>
        <span className="text-xs text-text2">ถ้าสแกนจ่ายแล้ว แตะเพื่อดูสถานะ</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-text3" />
    </Link>
  );
}
