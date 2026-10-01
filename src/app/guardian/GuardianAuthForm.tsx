"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GuardianLoginButton from "./GuardianLoginButton";

type Mode = "login" | "signup";

const INPUT_CLASS =
  "rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold";

// สมัคร/เข้าสู่ระบบของผู้ปกครอง (email + รหัสผ่าน หรือ Google) — แยกจาก /login ของนักเรียนทั้งหมด
// signUp ส่ง account_type='guardian' ใน metadata ให้ handle_new_user() สร้างแถว guardians (ไม่สร้าง
// โปรไฟล์นักเรียน) สิทธิ์ใช้ฟีเจอร์ยังคุมด้วย allowlist ที่ getGuardianAccess() เหมือนเดิม
export default function GuardianAuthForm() {
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setLoading(false);
        if (signInError.code === "invalid_credentials") {
          setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        } else if (signInError.code === "email_not_confirmed") {
          setError("กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ (ดูในกล่องจดหมายของคุณ)");
        } else if (signInError.code === "over_request_rate_limit" || signInError.status === 429) {
          setError("ลองเข้าสู่ระบบถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");
        } else {
          setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        }
        return;
      }
      // โหลดหน้าใหม่ทั้งหน้า — /guardian เป็น server component ที่ตัดสิน access จาก cookie ใหม่
      // (loading ค้าง true จนกว่าหน้าจะเปลี่ยน กันกดซ้ำ)
      window.location.assign("/guardian");
      return;
    }

    if (!accepted) {
      setLoading(false);
      setError("กรุณากดยอมรับนโยบายความเป็นส่วนตัวก่อนสมัครสมาชิก");
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_type: "guardian",
          display_name: displayName.trim(),
          phone: phone.trim(),
          privacy_accepted_at: new Date().toISOString(),
        },
        emailRedirectTo: `${window.location.origin}/guardian/callback`,
      },
    });
    if (signUpError) {
      setLoading(false);
      if (signUpError.code === "user_already_exists") {
        setError("อีเมลนี้ถูกใช้สมัครแล้ว ลองเข้าสู่ระบบแทนไหม");
      } else if (signUpError.code === "weak_password") {
        setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      } else {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }
      return;
    }

    // อีเมลที่สมัครไว้แล้ว Supabase (เปิด email confirmation) คืน user ที่ identities ว่างโดยไม่ error
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setLoading(false);
      setError("อีเมลนี้ถูกใช้สมัครแล้ว ลองเข้าสู่ระบบแทนไหม");
      return;
    }

    if (data.session) {
      // โปรเจกต์ที่ปิด email confirmation — ล็อกอินให้เลย
      window.location.assign("/guardian");
      return;
    }

    setLoading(false);
    setMessage("สมัครสำเร็จ! ตรวจสอบอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ");
    setMode("login");
    setPassword("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 rounded-full bg-track p-1 text-sm font-semibold" role="tablist">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`rounded-full py-1.5 transition ${
              mode === m ? "bg-card text-gold-hi shadow" : "text-text3 hover:text-text2"
            }`}
          >
            {m === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "signup" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="gd-name" className="text-sm font-medium text-text2">
                ชื่อที่ใช้แสดง
              </label>
              <input
                id="gd-name"
                type="text"
                required
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="เช่น คุณแม่พลอย / ครูสมชาย"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="gd-phone" className="text-sm font-medium text-text2">
                เบอร์โทร <span className="text-text3">(ไม่บังคับ)</span>
              </label>
              <input
                id="gd-phone"
                type="tel"
                inputMode="tel"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={INPUT_CLASS}
                placeholder="08XXXXXXXX"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="gd-email" className="text-sm font-medium text-text2">
            อีเมล
          </label>
          <input
            id="gd-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLASS}
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="gd-password" className="text-sm font-medium text-text2">
            รหัสผ่าน
          </label>
          <input
            id="gd-password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT_CLASS}
            placeholder="อย่างน้อย 6 ตัวอักษร"
          />
          {mode === "login" && (
            <Link
              href="/login/forgot-password"
              className="self-end text-xs font-medium text-text3 hover:text-text2"
            >
              ลืมรหัสผ่าน?
            </Link>
          )}
        </div>

        {mode === "signup" && (
          <label className="flex items-start gap-2 text-xs text-text2">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              ฉันยอมรับ{" "}
              <Link href="/privacy" target="_blank" className="text-gold-hi underline">
                นโยบายความเป็นส่วนตัว
              </Link>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red">{error}</p>}
        {message && <p className="text-sm text-gold-hi">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-full py-2.5 font-semibold text-track transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-hi focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
        >
          {loading ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-text3">หรือ</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <GuardianLoginButton />
    </div>
  );
}
