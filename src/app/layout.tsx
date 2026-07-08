import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const kanit = Kanit({
  variable: "--font-kanit",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "เลี้ยงมังกรเตรียมสอบ ม.4",
  description: "ตอบคำถามเตรียมสอบเข้า ม.4 แล้วเลี้ยงมังกรน้อยให้เติบโต",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${kanit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-text">
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
