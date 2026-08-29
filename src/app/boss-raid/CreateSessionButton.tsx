"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBossRaidSession } from "./actions";

export default function CreateSessionButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const { sessionId } = await createBossRaidSession();
              router.push(`/boss-raid/${sessionId}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "สร้างห้องไม่สำเร็จ");
            }
          })
        }
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "กำลังสร้าง…" : "สร้างห้อง"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
