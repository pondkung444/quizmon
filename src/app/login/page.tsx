"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { createClient } from "@/lib/supabase/client";
import SchoolAutocomplete from "@/components/SchoolAutocomplete";
import { track } from "@/lib/analytics";
import { markSeenAuth, useSeenAuth } from "@/lib/seenAuth";
import { checkSignupFields } from "./actions";

// อ่าน flash message จาก query (?reset=success / ?error=oauth_failed) ครั้งเดียวตอน init
// แล้ว strip URL ทิ้งใน effect ด้วย history.replaceState (ไม่ setState ใน effect)
function readInitialFlash(): { error: string | null; message: string | null } {
  if (typeof window === "undefined") return { error: null, message: null };
  const params = new URLSearchParams(window.location.search);
  if (params.get("reset") === "success") {
    return { error: null, message: "ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบ" };
  }
  if (params.get("error") === "oauth_failed") {
    return { error: "เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่", message: null };
  }
  return { error: null, message: null };
}

const NATIVE_OAUTH_CALLBACK_URL = "com.quizmon.app://login-callback";
const RESEND_COOLDOWN_SECONDS = 30;

// ปุ่ม CTA ผู้มาใหม่ + reused ใน State C — โทนส้มไล่เฉด (ชุดเดียวกับ www/offline.html)
const ORANGE_GRADIENT = "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // null = ยัง hydrate ไม่เสร็จ -> placeholder | true -> State C | false -> State A
  const seenAuth = useSeenAuth();

  const [sheetOpen, setSheetOpen] = useState<boolean>(() => {
    const f = readInitialFlash();
    return !!(f.error || f.message);
  });
  const [guestConfirmOpen, setGuestConfirmOpen] = useState(false);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => readInitialFlash().error);
  const [message, setMessage] = useState<string | null>(() => readInitialFlash().message);
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const guestCancelRef = useRef<HTMLButtonElement>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    };
  }, []);

  // strip ?reset / ?error ออกจาก URL หลังอ่านเข้า state แล้ว (history API ล้วน ไม่ setState)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  // จุดเดียวที่ตัดสินใจ redirect หลัง email/password login สำเร็จ (signInWithPassword ใน
  // handleSubmit ด้านล่างไม่ push เองแล้ว กัน race ที่ทั้งสองที่ push คนละปลายทางพร้อมกัน)
  // ส่วน Google OAuth ไม่ผ่าน listener นี้แล้ว — redirectTo ชี้ไป /login/callback (route handler)
  // ที่ exchange code + เช็ค profile + redirect ให้เสร็จฝั่ง server ก่อนกลับมาที่ client เลย
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== "SIGNED_IN" || !session?.user) return;

      // set flag เฉพาะ login/signup ที่ "ไม่ใช่" guest — ห้าม set ให้ anonymous เด็ดขาด
      if (!session.user.is_anonymous) markSeenAuth();

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, grade_level")
        .eq("id", session.user.id)
        .single();

      if (!profile?.username || !profile?.grade_level) {
        router.push("/login/complete-profile");
      } else {
        router.push("/");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  // native เท่านั้น: รับ deep link callback ที่ system browser ส่งกลับเข้าแอปหลัง Google
  // consent สำเร็จ (com.quizmon.app://login-callback?code=...) แล้ว exchange code ฝั่ง client
  // — exchangeCodeForSession จะ trigger SIGNED_IN ที่ listener ด้านบนจัดการ redirect ต่อเอง
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener("appUrlOpen", async (event: URLOpenListenerEvent) => {
      if (!event.url.startsWith(NATIVE_OAUTH_CALLBACK_URL)) return;

      await Browser.close().catch(() => {});

      const url = new URL(event.url.replace("com.quizmon.app://", "https://placeholder/"));
      const code = url.searchParams.get("code");
      if (!code) {
        setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่");
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [supabase]);

  // ---- bottom sheet: focus trap / Escape / คืน focus ให้ปุ่มที่เปิด ----
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    const el = lastFocusedRef.current;
    if (el && typeof el.focus === "function") {
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;

    const panel = sheetPanelRef.current;
    // หน่วงเล็กน้อยให้ผ่าน commit ที่ตั้ง aria-hidden บน State A (เบราว์เซอร์จะ blur ปุ่มเดิม
    // ไป body ก่อน) แล้วค่อยดึง focus เข้า field แรกในชีต
    const focusTimer = window.setTimeout(() => {
      const target = panel?.querySelector<HTMLElement>("input") ?? panel;
      target?.focus();
    }, 60);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [sheetOpen, closeSheet]);

  // guest confirm dialog: โฟกัสปุ่ม default + Escape ปิด
  useEffect(() => {
    if (!guestConfirmOpen) return;
    const focusTimer = window.setTimeout(() => guestCancelRef.current?.focus(), 60);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setGuestConfirmOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [guestConfirmOpen]);

  function openSheet() {
    lastFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    setError(null);
    setMessage(null);
    setShowResend(false);
    setMode("login");
    setSheetOpen(true);
  }

  function runGuestFlow() {
    track("landing_guest_cta", { seen_auth: seenAuth });
    router.push("/guest");
  }

  function handleGuestCta() {
    if (seenAuth) {
      setGuestConfirmOpen(true);
      return;
    }
    runGuestFlow();
  }

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

  // เว็บปกติ: signInWithOAuth redirect ทั้งหน้าไปหน้า Google consent ได้ตามปกติ
  // native (iOS/Android): Google บล็อก OAuth ที่มาจาก embedded WebView (403: disallowed_useragent)
  // เลยต้องเปิด consent screen ผ่าน system browser (@capacitor/browser) แล้วรับ callback
  // กลับเข้าแอปผ่าน custom URL scheme deep link แทน (ดู listener ใน useEffect ด้านบน)
  async function handleGoogleLogin() {
    if (Capacitor.isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: NATIVE_OAUTH_CALLBACK_URL,
          skipBrowserRedirect: true,
        },
      });
      if (error || !data?.url) {
        setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      await Browser.open({ url: data.url });
      return;
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login/callback` },
    });
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
      // ไม่ push เอง — onAuthStateChange ด้านบนจะเป็นคน redirect ให้หลังเช็ค profile
      // (กัน race ที่ทั้งสองที่ push คนละปลายทางพร้อมกัน ตามที่ระบุไว้ใน spec)
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

      if (!privacyAccepted) {
        setLoading(false);
        setError("กรุณากดยอมรับนโยบายความเป็นส่วนตัวก่อนสมัครสมาชิก");
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username, phone, school, grade_level: gradeLevel, privacy_accepted_at: new Date().toISOString() },
          emailRedirectTo: `${window.location.origin}/login/callback`,
        },
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

  const logo = (
    <div className="flex flex-col items-center text-center">
      <Image src="/brand/quizmon-logo-full.png" alt="QuizMon" width={220} height={65} priority />
      <p className="mt-1 text-sm text-text3">ทุกคำตอบ พาเราเติบโต</p>
    </div>
  );

  // ---- ชุดฟอร์ม auth ใช้ซ้ำใน bottom sheet (State B) และ inline (State C) ----
  function authStack() {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "signup" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="auth-username" className="text-sm font-medium text-text2">
                ชื่อที่ใช้แสดง
              </label>
              <input
                id="auth-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                placeholder="เช่น น้องพลอย"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="auth-grade" className="text-sm font-medium text-text2">
                ระดับชั้น
              </label>
              <select
                id="auth-grade"
                required
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="rounded-md border border-border bg-track px-3 py-2 text-text focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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

            <SchoolAutocomplete value={school} onChange={setSchool} required />

            <div className="flex flex-col gap-1">
              <label htmlFor="auth-phone" className="text-sm font-medium text-text2">
                เบอร์โทรศัพท์ (ไม่บังคับ)
              </label>
              <input
                id="auth-phone"
                type="tel"
                pattern="0[0-9]{8,9}"
                title="กรอกเบอร์โทร 9-10 หลัก ขึ้นต้นด้วย 0"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                placeholder="เช่น 0812345678"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-text2">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber"
              />
              <span>
                รับทราบ{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber underline underline-offset-2"
                >
                  นโยบายความเป็นส่วนตัว
                </a>{" "}
                ของ QuizMon
              </span>
            </label>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="auth-email" className="text-sm font-medium text-text2">
            อีเมล
          </label>
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
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-track py-2 pl-9 pr-3 text-text placeholder:text-text3 focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="auth-password" className="text-sm font-medium text-text2">
            รหัสผ่าน
          </label>
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
              id="auth-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-track py-2 pl-9 pr-9 text-text placeholder:text-text3 focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              placeholder="อย่างน้อย 6 ตัวอักษร"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-text3 hover:text-text2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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
              className="rounded text-xs font-medium text-text3 hover:text-text2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              ลืมรหัสผ่าน?
            </Link>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-start gap-2 animate-speech-pop">
            <p className="text-sm text-red">{error}</p>
            {showResend && (
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={resendLoading || resendCooldown > 0}
                className="rounded-md border border-border px-3 py-1 text-xs font-medium text-text2 transition hover:bg-track disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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
        {message && <p className="text-sm text-gold-hi animate-speech-pop">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-full py-2.5 font-semibold text-track transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-hi focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          style={{ background: ORANGE_GRADIENT }}
        >
          {loading ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-indigo-dim" />
          <span className="text-xs font-medium text-indigo-hi">หรือ</span>
          <div className="h-px flex-1 bg-indigo-dim" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="relative mx-auto h-10 rounded transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          style={{ aspectRatio: "4.5 / 1" }}
        >
          <Image
            src="/brand/google-sign-in.png"
            alt={mode === "login" ? "เข้าสู่ระบบด้วย Google" : "สมัครสมาชิกด้วย Google"}
            fill
            className="object-contain"
            sizes="180px"
          />
        </button>

        <p className="text-center text-xs text-text3">
          {mode === "login" ? "ยังไม่มีบัญชี? " : "มีบัญชีอยู่แล้ว? "}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setMessage(null);
              setShowResend(false);
              setMode((m) => (m === "login" ? "signup" : "login"));
            }}
            className="rounded font-semibold text-amber underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {mode === "login" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
          </button>
        </p>
      </form>
    );
  }

  // ---------- ก่อน hydrate เสร็จ: placeholder โลโก้อย่างเดียว (กัน State A แว้บก่อน State C) ----------
  if (seenAuth === null) {
    return (
      <main className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col items-center justify-center gap-6 bg-bg p-6">
        <AmbientGlow />
        {logo}
      </main>
    );
  }

  // ---------- State C: อุปกรณ์ที่เคย login มาก่อน ----------
  if (seenAuth) {
    return (
      <main className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center gap-6 bg-bg p-6">
        <AmbientGlow />
        {logo}

        <div className="relative rounded-xl border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-track p-3">
            <Image
              src="/pets/egg1_stage2_baby.png"
              alt=""
              width={44}
              height={44}
              className="shrink-0"
            />
            <div>
              <p className="text-sm font-bold text-gold-hi">ยินดีต้อนรับกลับ</p>
              <p className="text-xs text-text3">เข้าสู่ระบบเพื่อไปต่อกับ Qmon</p>
            </div>
          </div>

          {authStack()}

          <p className="mt-4 text-center text-xs text-text3">
            <button
              type="button"
              onClick={handleGuestCta}
              className="rounded underline underline-offset-2 hover:text-text2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              ไม่ใช่บัญชีนาย? เริ่มใหม่แบบไม่ต้องสมัคร
            </button>
          </p>
        </div>

        {guestConfirmOpen && (
          <GuestConfirmDialog
            cancelRef={guestCancelRef}
            onCancel={() => setGuestConfirmOpen(false)}
            onConfirm={() => {
              setGuestConfirmOpen(false);
              runGuestFlow();
            }}
          />
        )}
      </main>
    );
  }

  // ---------- State A: ผู้มาใหม่ + State B (bottom sheet) ----------
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col bg-bg">
      <AmbientGlow />

      <div
        className={`flex min-h-screen flex-col items-center gap-6 px-6 py-10 transition ${
          sheetOpen ? "pointer-events-none blur-[1px]" : ""
        }`}
        aria-hidden={sheetOpen}
      >
        {logo}

        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <div className="relative flex items-center justify-center">
            <div
              className="pointer-events-none absolute h-56 w-56 rounded-full opacity-70 blur-2xl"
              style={{ background: "radial-gradient(circle, rgba(240,160,92,0.55) 0%, rgba(240,160,92,0) 70%)" }}
            />
            <Image
              src="/pets/egg1_stage1_egg.png"
              alt="ไข่ Qmon"
              width={200}
              height={200}
              priority
              className="relative animate-landing-egg-bob drop-shadow-[0_10px_30px_rgba(224,134,58,0.35)]"
            />
          </div>

          <div className="space-y-1">
            <p className="text-base text-text2">ไข่ของนายกำลังรออยู่</p>
            <p className="text-lg font-semibold text-gold-hi">ตอบคำถามเพื่อฟักมันออกมา</p>
          </div>
        </div>

        <div className="w-full space-y-3 pb-4">
          <button
            type="button"
            onClick={handleGuestCta}
            className="flex w-full flex-col items-center rounded-full py-3 text-track transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-hi focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            style={{ background: ORANGE_GRADIENT }}
          >
            <span className="text-base font-bold leading-tight">เริ่มการผจญภัย</span>
            <span className="text-[11px] font-normal leading-tight opacity-80">
              ไม่ต้องสมัคร เริ่มได้เลย
            </span>
          </button>

          <button
            type="button"
            onClick={openSheet}
            className="mx-auto block rounded px-2 py-1 text-sm font-medium text-text3 hover:text-text2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            มีบัญชีอยู่แล้ว? เข้าสู่ระบบ
          </button>
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50 animate-speech-pop"
            onClick={closeSheet}
            aria-hidden
          />
          <div
            ref={sheetPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
            tabIndex={-1}
            className="relative w-full max-w-[420px] rounded-t-2xl border border-border bg-card p-6 pb-8 shadow-2xl max-h-[92vh] overflow-y-auto animate-sheet-up focus:outline-none"
            onTouchStart={(e) => {
              touchStartYRef.current = e.touches[0].clientY;
            }}
            onTouchEnd={(e) => {
              const start = touchStartYRef.current;
              touchStartYRef.current = null;
              if (start != null && e.changedTouches[0].clientY - start > 60) closeSheet();
            }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" aria-hidden />

            <div className="mb-4 text-center">
              <h1 className="text-lg font-bold text-gold-hi">
                {mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
              </h1>
              <p className="mt-0.5 text-xs text-text3">
                {mode === "login"
                  ? "กลับมาหา Qmon ของนายกันเถอะ"
                  : "สมัครเพื่อเก็บ Qmon ไว้ถาวร"}
              </p>
            </div>

            {authStack()}
          </div>
        </div>
      )}
    </main>
  );
}

function AmbientGlow() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
      style={{ background: "radial-gradient(circle, rgba(224,134,58,0.30) 0%, rgba(224,134,58,0) 70%)" }}
      aria-hidden
    />
  );
}

function GuestConfirmDialog({
  cancelRef,
  onCancel,
  onConfirm,
}: {
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="guest-confirm-title"
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl animate-speech-pop"
      >
        <h2 id="guest-confirm-title" className="text-base font-bold text-gold-hi">
          เริ่มใหม่แบบไม่ต้องสมัคร?
        </h2>
        <p className="mt-2 text-sm text-text2">
          เครื่องนี้เคยเข้าสู่ระบบมาก่อน ถ้าเริ่มใหม่จะได้ Qmon ตัวใหม่ ความคืบหน้าเดิมจะไม่หายไป
          แต่ต้องเข้าสู่ระบบเพื่อกลับไปหา
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-semibold text-track transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-hi focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            style={{ background: ORANGE_GRADIENT }}
          >
            เข้าสู่ระบบแทน
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text2 transition hover:bg-track focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            เริ่มใหม่
          </button>
        </div>
      </div>
    </div>
  );
}
