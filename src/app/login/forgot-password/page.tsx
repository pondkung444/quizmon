"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/reset-password`,
    });
    setLoading(false);

    if (error) {
      if (error.code === "over_email_send_rate_limit") {
        setError("ส่งอีเมลถี่เกินไป กรุณารอสักครู่");
      } else {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }
      return;
    }

    setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-bg p-6">
      <div className="flex flex-col items-center text-center">
        <Image
          src="/brand/quizmon-logo-full.png"
          alt="QuizMon"
          width={220}
          height={65}
          priority
        />
        <p className="mt-1 text-sm text-text3">ลืมรหัสผ่าน</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {sent ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-gold-hi">
              ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย
            </p>
            <Link href="/login" className="text-sm font-medium text-gold-hi hover:underline">
              กลับไปเข้าสู่ระบบ
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text2">อีเมล</label>
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-border bg-track py-2 pl-9 pr-3 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-full border border-gold bg-amber py-2 font-medium text-track transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "กำลังดำเนินการ..." : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
            </button>

            <Link href="/login" className="text-center text-sm text-text3 hover:text-text2">
              กลับไปเข้าสู่ระบบ
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
