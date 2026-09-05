"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import SchoolAutocomplete from "@/components/SchoolAutocomplete";
import { track } from "@/lib/analytics";

// localStorage flag — ตั้งก่อนเด้งไป Google consent, อ่านหลัง redirect กลับมาเพื่อโชว์ bottom sheet
// ถามโรงเรียน (ครั้งเดียว) ถ้า profiles.school ยังว่าง
export const GUEST_SCHOOL_PROMPT_FLAG = "guest_school_prompt_pending";

// user_metadata flag — ตั้งตอนขั้น 1 (updateUser({email})) ว่ายังต้องตั้งรหัสผ่านต่อ
// อ่านใน layout หลัง verify (is_anonymous=false) เพื่อโชว์ GuestSetPasswordPrompt
export const GUEST_PW_PENDING_META = "guest_pw_pending";

// ข้อความเดียวกันทั้ง 2 เส้นทาง (Google / email) เมื่อ Manual linking ปิดอยู่ใน Supabase —
// เป็นเรื่องตั้งค่า dashboard ไม่ใช่ผู้ใช้ทำอะไรผิด
export const MANUAL_LINKING_DISABLED_MSG =
  "ระบบผูกไอดียังไม่พร้อมใช้งาน — ผู้ดูแลต้องเปิด \"Manual linking\" ใน Supabase dashboard (Authentication → Providers) ก่อน";

// true ถ้า error บ่งบอกว่า manual identity linking ถูกปิดในโปรเจกต์
// (updateUser({email}) กับ anon user ก็ใช้ manual linking เหมือน linkIdentity() — docs: auth-anonymous)
export function isManualLinkingDisabled(err: AuthError | null): boolean {
  if (!err) return false;
  if (err.code === "manual_linking_disabled") return true;
  const m = (err.message || "").toLowerCase();
  return m.includes("manual linking") || m.includes("linking is disabled") || m.includes("identity linking");
}

// Milestone hard-gate (state a): guest (anonymous) ที่ Qmon วิวัฒนาการถึงระยะ 2 แล้ว และยังไม่เริ่ม
// ผูกไอดีเลย — เต็มจอ ปิด/ข้ามไม่ได้ เสนอ 2 ทาง: ผูกด้วย Google (ไม่ต้องรอเมล) หรืออีเมล + โรงเรียน
// เรนเดอร์จาก src/app/layout.tsx เมื่อ is_anonymous && ยังไม่มี new_email && activePetStage >= 2
export default function GuestUpgradeGate({ petName }: { petName: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState<null | "google" | "email">(null);
  const [error, setError] = useState<string | null>(null);

  const mon = petName || "Qmon ของเธอ";

  async function handleGoogle() {
    if (loading) return;
    setError(null);
    setLoading("google");
    try {
      localStorage.setItem(GUEST_SCHOOL_PROMPT_FLAG, "1");
    } catch {
      /* private mode — ข้ามได้ */
    }
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login/callback` },
    });
    // ปกติจะ redirect ทั้งหน้าไปแล้ว — ถึงตรงนี้แปลว่าเริ่มไม่สำเร็จ
    if (linkError) {
      try {
        localStorage.removeItem(GUEST_SCHOOL_PROMPT_FLAG);
      } catch {
        /* noop */
      }
      setLoading(null);
      if (isManualLinkingDisabled(linkError)) {
        setError(MANUAL_LINKING_DISABLED_MSG);
      } else if (
        linkError.code === "identity_already_exists" ||
        linkError.code === "email_exists" ||
        /already/i.test(linkError.message)
      ) {
        setError("อีเมลนี้มีบัญชีอยู่แล้ว ลองล็อกอินด้วยบัญชีเดิมแทนนะ");
      } else {
        setError("ผูกด้วย Google ไม่สำเร็จ ลองอีกครั้งนะ");
      }
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!privacyAccepted) {
      setError("กดยอมรับนโยบายความเป็นส่วนตัวก่อนนะ");
      return;
    }
    setError(null);
    setLoading("email");

    // ขั้น 1 (docs: auth-anonymous "Link an email / phone identity") — ส่ง email อย่างเดียว
    // password ตั้งทีหลังหลัง verify (GuestSetPasswordPrompt) เพราะ docs ไม่รับประกันว่า password
    // จะติดก่อน verify. เขียน metadata flag ไว้ (apply ทันที ไม่ต้องรอ confirm)
    const { data, error: updateError } = await supabase.auth.updateUser(
      { email: email.trim(), data: { [GUEST_PW_PENDING_META]: true } },
      { emailRedirectTo: `${window.location.origin}/login/callback` }
    );

    if (updateError) {
      setLoading(null);
      if (isManualLinkingDisabled(updateError)) {
        setError(MANUAL_LINKING_DISABLED_MSG);
      } else if (updateError.code === "email_exists" || updateError.code === "user_already_exists") {
        setError("อีเมลนี้มีบัญชีอยู่แล้ว ลองล็อกอินด้วยบัญชีเดิมแทนนะ");
      } else if (updateError.code === "validation_failed") {
        setError("อีเมลไม่ถูกต้อง ลองพิมพ์ใหม่นะ");
      } else {
        setError("ผูกไอดีไม่สำเร็จ ลองอีกครั้งนะ");
      }
      return;
    }

    // อัปเดตโรงเรียน (ไม่บังคับ) + บันทึกการยอมรับนโยบาย — best-effort
    const profilePatch: Record<string, string> = {
      privacy_accepted_at: new Date().toISOString(),
    };
    if (school.trim()) profilePatch.school = school.trim();
    await supabase.from("profiles").update(profilePatch).eq("id", data.user.id);

    track("guest_link_email_submitted");
    setLoading(null);
    // layout จะ re-render เป็น banner "รอยืนยันอีเมล" (ไม่บล็อก) เพราะ user.new_email มีค่าแล้ว
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-6 backdrop-blur-sm">
      <div className="my-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-gold bg-card p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-4xl">✨</span>
          <h2 className="text-lg font-bold text-gold-hi">{mon} พร้อมวิวัฒนาการแล้ว!</h2>
          <p className="text-sm text-text2">
            ผูกไอดีไว้เพื่อเก็บ {mon} เป็นของเธอตลอดไป และเล่นต่อได้ทุกเครื่อง
          </p>
        </div>

        {/* ทางที่ 1 — Google (แนะนำ ไม่ต้องรอเมล) */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading !== null}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold bg-amber py-3 text-base font-bold text-track shadow-lg transition active:scale-95 disabled:opacity-50"
        >
          {loading === "google" ? "กำลังพาไป Google..." : "ผูกไอดีด้วย Google"}
        </button>
        <p className="-mt-2 text-center text-[11px] text-text3">เร็วที่สุด — ผูกเสร็จเล่นต่อได้เลย</p>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-text3">หรือผูกด้วยอีเมล</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* ทางที่ 2 — email + โรงเรียน (ตั้งรหัสผ่านหลังยืนยันอีเมล) */}
        <form onSubmit={handleEmail} className="flex flex-col gap-3">
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

          <SchoolAutocomplete value={school} onChange={setSchool} />
          <p className="-mt-1 text-[11px] text-text3">ใส่โรงเรียนไว้ก็ได้ ไม่ใส่ก็ได้</p>

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
            disabled={loading !== null}
            className="w-full rounded-2xl border border-border bg-track py-3 text-base font-bold text-text transition active:scale-95 disabled:opacity-50"
          >
            {loading === "email" ? "กำลังส่งอีเมลยืนยัน..." : "ส่งอีเมลยืนยัน"}
          </button>
          <p className="-mt-1 text-center text-[11px] text-text3">
            ยืนยันในอีเมลแล้วค่อยตั้งรหัสผ่าน — เล่นต่อได้ระหว่างรอ
          </p>
        </form>
      </div>
    </div>
  );
}
