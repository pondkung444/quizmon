import type { Metadata, Viewport } from "next";
import { Kanit, Sarabun } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import GuestUpgradeGate, { GUEST_PW_PENDING_META } from "@/components/GuestUpgradeGate";
import GuestConfirmEmailBanner from "@/components/GuestConfirmEmailBanner";
import GuestSchoolPrompt from "@/components/GuestSchoolPrompt";
import GuestSetPasswordPrompt from "@/components/GuestSetPasswordPrompt";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import NativeAppSetup from "@/components/NativeAppSetup";
import OfflineScreen from "@/components/OfflineScreen";
import { createClient, getUser } from "@/lib/supabase/server";
import { getUnreadEncouragementCount } from "@/lib/encouragements";
import { getPvpBadgeCount } from "@/lib/pvp";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Quizmon",
  description: "ตอบถูกทุกข้อ มอนของคุณโตทุกครั้ง",
};

// viewport-fit=cover เปิดใช้งาน env(safe-area-inset-*) สำหรับ fixed-position elements
// ที่ชิดขอบจอ (จำเป็นสำหรับ Capacitor WebView ที่ไม่มี browser chrome เผื่อ notch/home indicator)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // เผื่อสำหรับ AnalyticsTracker เท่านั้น (props ของ event session_start) — layout persist ข้าม
  // client-side navigation ปกติ ไม่ได้ query ใหม่ทุกหน้า แค่ตอน full page load เท่านั้น
  const supabase = await createClient();
  const user = await getUser();
  const pathname = (await headers()).get("x-pathname") ?? "";

  let activePetStage: number | null = null;
  let activePetSubline: string | null = null;
  let activePetName: string | null = null;
  let hasUnreadEncouragements = false;
  let pvpBadgeCount = 0;
  let profileSchool: string | null = null;
  // guest (anonymous). สถานะการผูกไอดี (เช็คจาก is_anonymous + new_email + metadata flag):
  //   a) ยังไม่ผูก (anon, ไม่มี new_email) + pet ระยะ >= 2  -> full-screen block (GuestUpgradeGate)
  //   b) กรอกอีเมลแล้วรอกดลิงก์ยืนยัน (anon, มี new_email)  -> banner ไม่บล็อก (GuestConfirmEmailBanner)
  //   c) ยืนยันอีเมลแล้วแต่ยังไม่ตั้งรหัสผ่าน (!anon, guest_pw_pending) -> GuestSetPasswordPrompt (ไม่บล็อก)
  //   d) ผูกสำเร็จ (is_anonymous=false, ไม่มี flag)          -> ไม่มี gate
  const isAnonymous = user?.is_anonymous === true;
  const guestPendingEmail = (user?.new_email ?? "").trim();
  const guestNeedsPassword =
    !isAnonymous && user?.user_metadata?.[GUEST_PW_PENDING_META] === true;
  if (user) {
    const [{ data: pet }, unreadCount, { data: profile }, badgeCount] = await Promise.all([
      supabase.from("pets").select("stage, subline, nickname").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      getUnreadEncouragementCount(supabase),
      supabase.from("profiles").select("username, grade_level, school").eq("id", user.id).single(),
      getPvpBadgeCount(supabase, user.id),
    ]);
    activePetStage = pet?.stage ?? null;
    activePetSubline = pet?.subline ?? null;
    activePetName = pet?.nickname ?? null;
    hasUnreadEncouragements = unreadCount > 0;
    pvpBadgeCount = badgeCount;
    profileSchool = (profile?.school ?? null) || null;

    // บังคับให้กรอก complete-profile ให้เสร็จก่อนเข้าหน้าอื่นในแอป (กันเคส Google OAuth
    // signup ที่ profile ยังไม่ครบแล้วหนีไปหน้าอื่นได้เฉยๆ โดยไม่ผ่านฟอร์ม)
    if (!pathname.startsWith("/login") && (!profile?.username || !profile?.grade_level)) {
      redirect("/login/complete-profile");
    }
  }

  return (
    <html lang="th" className={`${kanit.variable} ${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <NativeAppSetup />
        <OfflineScreen />
        <AnalyticsTracker activePetStage={activePetStage} activePetSubline={activePetSubline} />
        {children}
        <BottomNav hasUnreadEncouragements={hasUnreadEncouragements} pvpBadgeCount={pvpBadgeCount} />
        {isAnonymous && !guestPendingEmail && activePetStage !== null && activePetStage >= 2 && (
          <GuestUpgradeGate petName={activePetName ?? ""} />
        )}
        {isAnonymous && guestPendingEmail && (
          <GuestConfirmEmailBanner pendingEmail={guestPendingEmail} />
        )}
        {guestNeedsPassword && <GuestSetPasswordPrompt />}
        {user && !isAnonymous && !guestNeedsPassword && !profileSchool && (
          <GuestSchoolPrompt userId={user.id} />
        )}
      </body>
    </html>
  );
}
