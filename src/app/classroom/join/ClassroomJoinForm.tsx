"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { joinClassroomSession } from "../actions";

const LEN = 6;

// รหัสห้องตัวเลขล้วน 6 หลัก — input จริงตัวเดียว (inputMode numeric: มือถือเปิดแป้นตัวเลขเอง ไม่ต้องสลับ
// คีย์บอร์ดไทย/อังกฤษ, paste/autofill ได้) วางทับกล่องแสดงผล 6 ช่อง. ครบ 6 หลักส่งเองอัตโนมัติ
export default function ClassroomJoinForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(initialCode.replace(/\D/g, "").slice(0, LEN));
  const [focused, setFocused] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const lastSubmitted = useRef<string | null>(null);

  const submit = useCallback(
    (value: string) => {
      lastSubmitted.current = value;
      start(async () => {
        setError(null);
        try {
          const { sessionId } = await joinClassroomSession(value);
          router.push(`/classroom/${sessionId}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "เข้าห้องไม่สำเร็จ");
        }
      });
    },
    [router]
  );

  // ลิงก์ ?code= (รวมรหัสห้องเก่าแบบตัวอักษร) → เข้าเลย
  useEffect(() => {
    const legacy = initialCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (legacy.length === LEN) submit(legacy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === LEN) submit(code);
      }}
    >
      <div className="relative" onClick={() => inputRef.current?.focus()}>
        <div className="grid grid-cols-6 gap-2" aria-hidden="true">
          {Array.from({ length: LEN }, (_, i) => {
            const active = focused && (i === code.length || (i === LEN - 1 && code.length === LEN));
            return (
              <div
                key={i}
                className={`flex aspect-[4/5] items-center justify-center rounded-xl border-2 bg-track font-mono text-3xl font-bold text-gold-hi transition ${
                  error ? "border-red/60" : active ? "border-amber" : code[i] ? "border-gold-dim" : "border-border"
                } ${i === 2 ? "mr-2" : ""}`}
              >
                {code[i] ?? ""}
              </div>
            );
          })}
        </div>
        <input
          ref={inputRef}
          autoFocus
          aria-label="รหัสห้อง 6 หลัก"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={LEN}
          value={code}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, LEN);
            setCode(next);
            setError(null);
            if (next.length === LEN && next !== lastSubmitted.current && !pending) submit(next);
          }}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      </div>

      {error && <p className="mt-3 text-center text-sm text-red">{error}</p>}

      <button
        type="submit"
        disabled={pending || code.length !== LEN}
        className="mt-6 w-full rounded-2xl border border-gold bg-amber px-4 py-3.5 text-lg font-bold text-on-amber transition active:scale-95 disabled:opacity-50"
      >
        {pending ? "กำลังเข้าห้อง…" : "เข้าห้อง"}
      </button>
    </form>
  );
}
