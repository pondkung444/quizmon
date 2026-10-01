"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardianEnsureAccount } from "./actions";

// ล็อกอินแล้วแต่ยังไม่มีแถว guardians — ให้เปิดบัญชีผู้ปกครองเองได้ในหน้าเดียว (ไม่ต้องรอทีมงาน)
export default function GuardianEnableAccount() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    const res = await guardianEnsureAccount(name);
    if (res.error) {
      setLoading(false);
      setError(res.error);
      return;
    }
    router.refresh();
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-text2">บัญชีนี้ยังไม่ได้เปิดเป็นบัญชีผู้ปกครอง ตั้งชื่อที่ใช้แสดงแล้วกดเปิดใช้งานได้เลย</p>
      <input
        type="text"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus-visible:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        placeholder="เช่น คุณแม่พลอย / ครูสมชาย"
      />
      {error && <p className="text-sm text-red">{error}</p>}
      <button
        type="submit"
        disabled={loading || name.trim().length === 0}
        className="rounded-full py-2.5 font-semibold text-track transition hover:opacity-90 disabled:opacity-50"
        style={{ background: "linear-gradient(180deg, #f0a05c 0%, var(--color-amber) 100%)" }}
      >
        {loading ? "กำลังเปิดบัญชี..." : "เปิดบัญชีผู้ปกครอง"}
      </button>
    </form>
  );
}
