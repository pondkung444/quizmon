"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 30;

// Milestone gate (state b): guest ที่กรอกอีเมลผูกไอดีไปแล้ว รอกดลิงก์ยืนยันในเมล —
// ไม่บล็อกการเล่น แค่ banner เตือนเชิงบวก + ปุ่มส่งอีเมลอีกครั้ง
// เรนเดอร์จาก src/app/layout.tsx เมื่อ is_anonymous && user.new_email มีค่า
// การผูกอีเมลกับ anon user ใช้ flow "email change" (Email ว่าง, NewEmail = อีเมลใหม่) →
// resend type ต้องเป็น 'email_change'
export default function GuestConfirmEmailBanner({ pendingEmail }: { pendingEmail: string }) {
  const supabase = createClient();
  const [cooldown, setCooldown] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleResend() {
    if (state === "sending" || cooldown > 0) return;
    setState("sending");
    const { error } = await supabase.auth.resend({
      type: "email_change",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/login/callback` },
    });
    if (error) {
      setState("error");
      return;
    }
    setState("sent");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 border-b border-gold-dim bg-card px-4 py-2 shadow-sm"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-1.5">
        <p className="text-xs text-text2">
          <span className="font-bold text-gold-hi">เกือบเสร็จแล้ว! 🎉</span> เช็คอีเมล{" "}
          <span className="font-bold text-text">{pendingEmail}</span> แล้วกดลิงก์ยืนยันเพื่อผูกไอดีให้สมบูรณ์
          — เล่นต่อได้ตามปกติระหว่างรอนะ
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={state === "sending" || cooldown > 0}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-text2 transition active:scale-95 disabled:opacity-50"
          >
            {cooldown > 0
              ? `ส่งอีเมลอีกครั้ง (${cooldown}s)`
              : state === "sending"
                ? "กำลังส่ง..."
                : "ส่งอีเมลอีกครั้ง"}
          </button>
          {state === "sent" && <span className="text-xs text-gold-hi">ส่งแล้ว เช็คกล่องเมลได้เลย</span>}
          {state === "error" && (
            <span className="text-xs text-red">ส่งไม่สำเร็จ ลองใหม่อีกครั้งนะ</span>
          )}
        </div>
      </div>
    </div>
  );
}
