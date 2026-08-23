"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import SchoolAutocomplete from "@/components/SchoolAutocomplete";
import { checkSignupFields } from "@/app/login/actions";

const HERO_BABY_SPRITES = [
  "/pets/egg1_stage2_baby.png",
  "/pets/egg2_stage2_baby.png",
  "/pets/egg3_stage2_baby.png",
  "/pets/egg4_stage2_baby.png",
  "/pets/egg5_stage2_baby.png",
];

export default function CompleteProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [heroBaby, setHeroBaby] = useState(HERO_BABY_SPRITES[0]);

  const [username, setUsername] = useState("");
  const [school, setSchool] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHeroBaby(HERO_BABY_SPRITES[Math.floor(Math.random() * HERO_BABY_SPRITES.length)]);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, grade_level")
        .eq("id", session.user.id)
        .single();

      if (!active) return;

      if (profile?.username && profile?.grade_level) {
        router.replace("/");
        return;
      }

      setUserId(session.user.id);
      setChecking(false);
    })();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    setLoading(true);
    setError(null);

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

    const { error } = await supabase
      .from("profiles")
      .update({ username, school, grade_level: gradeLevel, privacy_accepted_at: new Date().toISOString() })
      .eq("id", userId);
    setLoading(false);

    if (error) {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    router.replace("/");
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 bg-bg p-6">
        <p className="text-sm text-text3">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-bg p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="flex items-center justify-center gap-2">
          <Image
            src={heroBaby}
            alt="QuizMon"
            width={60}
            height={60}
            className="animate-pet-bob"
            priority
          />
          <span className="text-2xl font-bold text-amber">QuizMon</span>
        </div>
        <p className="text-xs text-text3">เกือบเสร็จแล้ว! กรอกข้อมูลอีกนิดเพื่อเริ่มผจญภัย</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <SchoolAutocomplete value={school} onChange={setSchool} required />

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
                onClick={(e) => e.stopPropagation()}
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
            disabled={loading || !privacyAccepted}
            className="rounded-full border border-gold bg-amber py-2 font-medium text-track transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "กำลังดำเนินการ..." : "เริ่มการผจญภัย"}
          </button>
        </form>
      </div>
    </main>
  );
}
