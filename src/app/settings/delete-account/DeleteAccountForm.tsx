"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { deleteOwnAccount } from "@/app/settings/actions";

export default function DeleteAccountForm({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [typedEmail, setTypedEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const emailMatches = typedEmail.trim().toLowerCase() === userEmail.toLowerCase();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteOwnAccount();
        const supabase = createClient();
        await supabase.auth.signOut();
        router.replace("/login");
      } catch (e) {
        setError(e instanceof Error ? e.message : "ลบบัญชีไม่สำเร็จ ลองอีกครั้งนะ");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-red bg-card p-5 text-center">
        <AlertTriangle className="h-8 w-8 text-red" />
        <h2 className="text-base font-bold text-red">ลบบัญชีถาวร</h2>
        <p className="text-sm text-text3">
          การลบบัญชีจะลบข้อมูลทั้งหมดทันที ไม่มีระยะเวลาผ่อนผัน และ<span className="font-bold text-text2">กู้คืนไม่ได้</span>
          <br />
          รวมถึง Qmon ของคุณ, ไข่, สถิติการตอบคำถาม, เพื่อนและกำลังใจ, achievement ที่ปลดล็อกไว้ทั้งหมด
        </p>
      </div>

      <div className="rounded-2xl border border-gold-dim bg-card p-4">
        <label className="mb-2 block text-sm text-text2" htmlFor="confirm-email">
          พิมพ์อีเมล <span className="font-bold text-text">{userEmail}</span> เพื่อยืนยัน
        </label>
        <input
          id="confirm-email"
          type="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={typedEmail}
          onChange={(e) => setTypedEmail(e.target.value)}
          placeholder="พิมพ์อีเมลของคุณที่นี่"
          className="w-full rounded-xl border border-gold-dim bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-gold"
        />
      </div>

      {error && <p className="text-center text-sm text-red">{error}</p>}

      <button
        type="button"
        disabled={!emailMatches || isPending}
        onClick={handleDelete}
        className="w-full rounded-2xl border border-red bg-red py-3 text-sm font-bold text-text shadow-lg transition active:scale-95 disabled:opacity-40"
      >
        {isPending ? "กำลังลบบัญชี..." : "ลบบัญชีถาวร"}
      </button>
    </div>
  );
}
