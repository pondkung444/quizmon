"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { joinBossRaidSession } from "../actions";

export default function JoinForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(value: string) {
    start(async () => {
      setError(null);
      try {
        const { sessionId } = await joinBossRaidSession(value);
        router.push(`/boss-raid/${sessionId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "เข้าห้องไม่สำเร็จ");
      }
    });
  }

  // ลิงก์/QR มี ?code= ครบ 6 หลัก -> join อัตโนมัติ
  useEffect(() => {
    if (/^[A-Z0-9]{6}$/.test(initialCode.toUpperCase())) submit(initialCode.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
    >
      <input
        autoFocus
        inputMode="text"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        placeholder="ABC123"
        className="w-full rounded-lg border border-border bg-track px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-gold-hi placeholder:text-text3"
      />
      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="w-full rounded-2xl border border-gold bg-amber px-4 py-3 font-bold text-track transition active:scale-95 disabled:opacity-50"
      >
        {pending ? "กำลังเข้าห้อง…" : "เข้าห้อง"}
      </button>
      {error && <p className="text-sm text-red">{error}</p>}
    </form>
  );
}
