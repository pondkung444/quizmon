"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { checkSignupFields } from "@/app/login/actions";
import { track } from "@/lib/analytics";

const GRADE_OPTIONS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

export default function GuestStartPage() {
  const router = useRouter();
  const supabase = createClient();

  const [username, setUsername] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStart = username.trim().length > 0 && gradeLevel !== "" && !loading;

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    setLoading(true);
    setError(null);

    const name = username.trim();

    const fieldCheck = await checkSignupFields(name, "");
    if (fieldCheck.blocked) {
      setLoading(false);
      setError("ลองตั้งชื่อใหม่ดูนะ ชื่อนี้ใช้ไม่ได้");
      return;
    }

    const { error: signInError } = await supabase.auth.signInAnonymously({
      options: { data: { username: name, grade_level: gradeLevel } },
    });

    if (signInError) {
      setLoading(false);
      setError("เริ่มเล่นไม่สำเร็จ ลองอีกครั้งนะ");
      return;
    }

    track("guest_start", { grade_level: gradeLevel });
    // trigger handle_new_user() สร้างโปรไฟล์ + ไข่ starter ให้แล้ว — ไปฟักไข่ต่อได้เลย
    router.replace("/eggs");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-bg p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <Image
          src="/brand/quizmon-logo-full.png"
          alt="QuizMon"
          width={200}
          height={59}
          priority
        />
        <p className="mt-1 text-sm text-text3">ทุกคำตอบ พาเราเติบโต</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 text-center">
          <h1 className="text-lg font-bold text-gold-hi">เริ่มเล่นได้เลย!</h1>
          <p className="mt-1 text-xs text-text3">
            ใส่ชื่อกับระดับชั้น แล้วฟักไข่ Qmon ตัวแรกของเธอได้ทันที
          </p>
        </div>

        <form onSubmit={handleStart} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text2">ชื่อที่ใช้แสดง</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
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
              {GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red animate-speech-pop">{error}</p>}

          <button
            type="submit"
            disabled={!canStart}
            className="rounded-full border border-gold bg-amber py-2 font-medium text-track transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "กำลังเตรียมไข่..." : "เริ่มเลย"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-text3">
          เล่นไปก่อนได้เลย ค่อยผูกไอดีเก็บ Qmon ไว้ทีหลังก็ได้
        </p>
      </div>

      <p className="text-center text-xs text-text3">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" className="font-medium text-amber underline underline-offset-2">
          เข้าสู่ระบบ
        </Link>
      </p>
    </main>
  );
}
