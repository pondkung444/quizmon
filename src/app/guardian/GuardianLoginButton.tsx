"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// รอบนี้ทำเฉพาะเว็บ (ยังไม่ทำ native custom-scheme callback แบบ /login — ผู้ปกครองทดสอบผ่านเบราว์เซอร์ก่อน)
export default function GuardianLoginButton() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/guardian/callback` },
    });
    if (error) setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full rounded-full py-2.5 font-semibold text-track transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-hi focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
    >
      {loading ? "กำลังเชื่อมต่อ..." : "เข้าสู่ระบบด้วย Google"}
    </button>
  );
}
