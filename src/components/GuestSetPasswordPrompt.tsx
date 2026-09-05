"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GUEST_PW_PENDING_META, isManualLinkingDisabled, MANUAL_LINKING_DISABLED_MSG } from "@/components/GuestUpgradeGate";
import { track } from "@/lib/analytics";

// ขั้น 2 ของการผูกด้วยอีเมล (docs: auth-anonymous) — user ยืนยันอีเมลแล้ว (is_anonymous=false)
// แต่ยังไม่เคยตั้งรหัสผ่าน. เรนเดอร์จาก layout เมื่อ !is_anonymous && user_metadata.guest_pw_pending===true
// ไม่บล็อกการเล่น (ไอดีผูกแล้ว ข้อมูลปลอดภัย) — กด "ตั้งทีหลัง" ได้ แต่จะเด้งซ้ำทุกครั้งที่โหลดแอปจนกว่าจะตั้ง
export default function GuestSetPasswordPrompt() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { [GUEST_PW_PENDING_META]: false },
    });

    if (updateError) {
      setLoading(false);
      if (isManualLinkingDisabled(updateError)) {
        setError(MANUAL_LINKING_DISABLED_MSG);
      } else if (updateError.code === "weak_password") {
        setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      } else if (updateError.code === "same_password") {
        setError("ตั้งรหัสผ่านใหม่ที่ไม่ซ้ำกับเดิมนะ");
      } else {
        setError("ตั้งรหัสผ่านไม่สำเร็จ ลองอีกครั้งนะ");
      }
      return;
    }

    track("guest_link_password_set");
    setLoading(false);
    router.refresh();
  }

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-sm">
      <div className="my-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-gold bg-card p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-4xl">🔒</span>
          <h2 className="text-lg font-bold text-gold-hi">ยืนยันอีเมลแล้ว! ตั้งรหัสผ่านต่อเลย</h2>
          <p className="text-sm text-text2">
            ตั้งรหัสผ่านไว้เพื่อเข้าสู่ระบบด้วยอีเมลได้ในครั้งต่อไป
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text2">รหัสผ่านใหม่</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-track py-2 pl-3 pr-16 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text3"
              >
                {showPassword ? "ซ่อน" : "แสดง"}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red animate-speech-pop">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl border border-gold bg-amber py-3 text-base font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
          >
            {loading ? "กำลังบันทึก..." : "ตั้งรหัสผ่าน"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-center text-xs font-medium text-text3"
          >
            ตั้งทีหลัง
          </button>
        </form>
      </div>
    </div>
  );
}
