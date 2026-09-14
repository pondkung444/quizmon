"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GuardianLinkForm() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedStudentId, setLinkedStudentId] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.rpc("guardian_claim_invite_code", {
      p_invite_code: code.trim(),
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLinkedStudentId(data?.[0]?.student_id ?? null);
  }

  if (linkedStudentId) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <p className="text-sm font-semibold text-gold-hi">เชื่อมบัญชีสำเร็จ</p>
        <p className="text-xs text-text3">student_id: {linkedStudentId}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="invite-code" className="text-sm font-medium text-text2">
          รหัสเชิญ 8 หลัก
        </label>
        <input
          id="invite-code"
          type="text"
          required
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="rounded-md border border-border bg-track px-3 py-2 text-center text-lg font-semibold tracking-[0.3em] text-text placeholder:text-text3 placeholder:tracking-normal focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          placeholder="เช่น A2B3C4D5"
        />
      </div>

      {error && <p className="text-sm text-red">{error}</p>}

      <button
        type="submit"
        disabled={loading || code.trim().length !== 8}
        className="rounded-full py-2.5 font-semibold text-track transition hover:opacity-90 disabled:opacity-50"
        style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
      >
        {loading ? "กำลังเชื่อม..." : "เชื่อมบัญชี"}
      </button>
    </form>
  );
}
