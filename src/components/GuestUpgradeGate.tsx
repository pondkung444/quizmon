"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

// Milestone hard-gate: guest (anonymous session) ที่ Qmon ตัวที่เลี้ยงอยู่วิวัฒนาการถึงระยะ 2 แล้ว
// ต้องผูกไอดีก่อนถึงจะเล่นต่อได้ — เต็มจอ ปิด/ข้ามไม่ได้ (ไม่มีปุ่ม X)
// เรนเดอร์จาก src/app/layout.tsx เมื่อ user.is_anonymous && activePetStage >= 2
export default function GuestUpgradeGate({ petName }: { petName: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "linked" | "verify">(null);

  const mon = petName || "Qmon ของเธอ";

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (!privacyAccepted) {
      setError("กดยอมรับนโยบายความเป็นส่วนตัวก่อนนะ");
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: updateError } = await supabase.auth.updateUser({
      email: email.trim(),
      password,
    });

    if (updateError) {
      setLoading(false);
      if (updateError.code === "email_exists" || updateError.code === "user_already_exists") {
        setError("อีเมลนี้มีบัญชีอยู่แล้ว ลองอีเมลอื่นดูนะ");
      } else if (updateError.code === "weak_password") {
        setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      } else if (updateError.code === "validation_failed") {
        setError("อีเมลไม่ถูกต้อง ลองพิมพ์ใหม่นะ");
      } else {
        setError("ผูกไอดีไม่สำเร็จ ลองอีกครั้งนะ");
      }
      return;
    }

    // บันทึกการยอมรับนโยบายความเป็นส่วนตัวลงโปรไฟล์ (best-effort)
    await supabase
      .from("profiles")
      .update({ privacy_accepted_at: new Date().toISOString() })
      .eq("id", data.user.id);

    track("guest_link_success");
    setLoading(false);

    // ถ้า Supabase ต้องให้ยืนยันอีเมลก่อน is_anonymous จะยังไม่เปลี่ยนจนกว่าจะกดลิงก์ในเมล
    const needsVerify = data.user.is_anonymous !== false || !!data.user.new_email;
    setDone(needsVerify ? "verify" : "linked");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-6 backdrop-blur-sm">
      <div className="my-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-gold bg-card p-6 shadow-2xl">
        {done ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">🎉</span>
            <h2 className="text-lg font-bold text-gold-hi">
              {done === "linked" ? `${mon} เป็นของเธอแล้ว!` : "ผูกไอดีเกือบเสร็จแล้ว!"}
            </h2>
            <p className="text-sm text-text2">
              {done === "linked"
                ? "เล่นต่อได้เลย ความคืบหน้าทั้งหมดถูกเก็บไว้ให้เรียบร้อย"
                : `เปิดอีเมลที่ส่งไปให้ แล้วกดยืนยันเพื่อเก็บ ${mon} ไว้ถาวรนะ`}
            </p>
            <button
              type="button"
              onClick={() => {
                setDone(null);
                router.refresh();
              }}
              className="mt-1 w-full rounded-2xl border border-gold bg-amber py-3 text-base font-bold text-track shadow-lg transition active:scale-95"
            >
              เล่นต่อ
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-4xl">✨</span>
              <h2 className="text-lg font-bold text-gold-hi">{mon} พร้อมวิวัฒนาการแล้ว!</h2>
              <p className="text-sm text-text2">
                ผูกไอดีไว้เพื่อเก็บ {mon} เป็นของเธอตลอดไป และเล่นต่อได้ทุกเครื่อง
              </p>
            </div>

            <form onSubmit={handleLink} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-text2">อีเมล</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
                  placeholder="you@example.com"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-text2">รหัสผ่าน</label>
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

              {error && <p className="text-sm text-red animate-speech-pop">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl border border-gold bg-amber py-3 text-base font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
              >
                {loading ? "กำลังผูกไอดี..." : "ผูกไอดีเก็บ Qmon ไว้"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
