"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setSessionReady(true);
      } else {
        setSessionExpired(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setSessionReady(true);
        setSessionExpired(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      if (error.name === "AuthSessionMissingError") {
        setSessionExpired(true);
      } else if (error.code === "same_password") {
        setError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม");
      } else if (error.code === "weak_password") {
        setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      } else {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }
      return;
    }

    router.push("/login?reset=success");
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
        <p className="mt-1 text-sm text-text3">ตั้งรหัสผ่านใหม่</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {sessionExpired ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-red">ลิงก์หมดอายุ กรุณาขอลิงก์ใหม่</p>
            <Link
              href="/login/forgot-password"
              className="rounded-full border border-gold bg-amber px-4 py-2 text-sm font-medium text-track transition hover:opacity-90"
            >
              ขอลิงก์ใหม่
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text2">รหัสผ่านใหม่</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text2">ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
              />
            </div>

            {error && <p className="text-sm text-red">{error}</p>}

            <button
              type="submit"
              disabled={loading || !sessionReady}
              className="rounded-full border border-gold bg-amber py-2 font-medium text-track transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "กำลังดำเนินการ..." : "ตั้งรหัสผ่านใหม่"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
