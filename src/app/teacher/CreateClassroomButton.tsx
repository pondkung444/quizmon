"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClassroomSession } from "./actions";

export default function CreateClassroomButton() {
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
              const { sessionId } = await createClassroomSession();
              router.push(`/teacher/${sessionId}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "เปิดห้องไม่สำเร็จ");
            }
          })
        }
        className="rounded-xl border border-gold bg-amber px-4 py-2 text-sm font-bold text-track transition active:scale-95 disabled:opacity-50"
      >
        {pending ? "กำลังเปิด…" : "เปิดห้องเรียน"}
      </button>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}
