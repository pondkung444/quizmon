import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { createClient } from "@/lib/supabase/server";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Quizmon",
  description: "ตอบถูกทุกข้อ มอนของคุณโตทุกครั้ง",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // เผื่อสำหรับ AnalyticsTracker เท่านั้น (props ของ event session_start) — layout persist ข้าม
  // client-side navigation ปกติ ไม่ได้ query ใหม่ทุกหน้า แค่ตอน full page load เท่านั้น
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let activePetStage: number | null = null;
  let activePetSubline: string | null = null;
  if (user) {
    const { data: pet } = await supabase
      .from("pets")
      .select("stage, subline")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    activePetStage = pet?.stage ?? null;
    activePetSubline = pet?.subline ?? null;
  }

  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <AnalyticsTracker activePetStage={activePetStage} activePetSubline={activePetSubline} />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
