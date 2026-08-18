"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import SchoolAutocomplete from "@/components/SchoolAutocomplete";
import { checkSignupFields } from "./actions";

const RESEND_COOLDOWN_SECONDS = 30;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      setMessage("ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบ");
      router.replace("/login");
    }
  }, [router]);

  async function handleResendConfirmation() {
    if (resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    await supabase.auth.resend({ type: "signup", email });
    setResendLoading(false);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setShowResend(false);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        if (error.code === "invalid_credentials") {
          setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        } else if (error.code === "email_not_confirmed") {
          setError("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ");
          setShowResend(true);
        } else if (error.code === "over_request_rate_limit" || error.status === 429) {
          setError("ลองเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");
        } else {
          setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        }
        return;
      }
      router.push("/pet");
    } else {
      const fieldCheck = await checkSignupFields(username, school);
      if (fieldCheck.blocked) {
        setLoading(false);
        setError(
          fieldCheck.field === "school"
            ? "ชื่อโรงเรียนนี้ใช้ไม่ได้ ลองพิมพ์ใหม่อีกครั้งนะ"
            : "ลองตั้งชื่อใหม่ดูนะ ชื่อนี้ใช้ไม่ได้"
        );
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username, phone, school, grade_level: gradeLevel } },
      });
      setLoading(false);
      if (error) {
        if (error.code === "user_already_exists") {
          setError("อีเมลนี้ถูกใช้สมัครแล้ว ลองเข้าสู่ระบบแทนไหม");
        } else if (error.code === "weak_password") {
          setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        } else {
          setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        }
        return;
      }
      setMessage("สมัครสำเร็จ! ตรวจสอบอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ");
      setMode("login");
    }
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
        <p className="mt-1 text-sm text-text3">ทุกคำตอบ พาเราเติบโต</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex rounded-lg border border-border bg-track p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "login" ? "bg-card text-gold-hi shadow" : "text-text3"
            }`}
          >
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "signup" ? "bg-card text-gold-hi shadow" : "text-text3"
            }`}
          >
            สมัครสมาชิก
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "signup" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text2">ชื่อที่ใช้แสดง</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                placeholder="เช่น น้องพลอย"
              />
            </div>
          )}

          {mode === "signup" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text2">ระดับชั้น</label>
              <select
                required
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="rounded-md border border-border bg-track px-3 py-2 text-text focus:border-gold focus:outline-none"
              >
                <option value="">-- เลือกระดับชั้น --</option>
                <option value="ม.1">ม.1</option>
                <option value="ม.2">ม.2</option>
                <option value="ม.3">ม.3</option>
                <option value="ม.4">ม.4</option>
                <option value="ม.5">ม.5</option>
                <option value="ม.6">ม.6</option>
              </select>
            </div>
          )}

          {mode === "signup" && (
            <SchoolAutocomplete value={school} onChange={setSchool} required />
          )}

          {mode === "signup" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text2">เบอร์โทรศัพท์ (ไม่บังคับ)</label>
              <input
                type="tel"
                pattern="0[0-9]{8,9}"
                title="กรอกเบอร์โทร 9-10 หลัก ขึ้นต้นด้วย 0"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                placeholder="เช่น 0812345678"
              />
            </div>
          )}

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

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text2">รหัสผ่าน</label>
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-track py-2 pl-9 pr-9 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text2"
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                {showPassword ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 4.24A9.77 9.77 0 0112 4c5 0 9 4 10 8-.31 1.16-.84 2.24-1.53 3.2M6.6 6.6C4.4 8 2.9 9.9 2 12c1 4 5 8 10 8 1.53 0 2.98-.31 4.28-.87"
                    />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
                    />
                    <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {mode === "login" && (
            <div className="flex justify-end">
              <Link
                href="/login/forgot-password"
                className="text-xs font-medium text-text3 hover:text-text2"
              >
                ลืมรหัสผ่าน?
              </Link>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-red">{error}</p>
              {showResend && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resendLoading || resendCooldown > 0}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium text-text2 transition hover:bg-track disabled:opacity-50"
                >
                  {resendCooldown > 0
                    ? `ส่งอีเมลยืนยันอีกครั้ง (${resendCooldown}s)`
                    : resendLoading
                      ? "กำลังส่ง..."
                      : "ส่งอีเมลยืนยันอีกครั้ง"}
                </button>
              )}
            </div>
          )}
          {message && <p className="text-sm text-gold-hi">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="rounded-full border border-gold bg-amber py-2 font-medium text-track transition hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "กำลังดำเนินการ..."
              : mode === "login"
                ? "เริ่มการผจญภัย"
                : "สมัครสมาชิก"}
          </button>
        </form>
      </div>
    </main>
  );
}
