"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createClassroomSession } from "./actions";

// เปิดห้อง: ชื่อห้องไม่บังคับ (แก้ทีหลังในห้องได้) แต่ถามไว้เลยเพราะครูสอนหลายห้องต่อวัน
export default function CreateClassroomButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  function create() {
    start(async () => {
      setError(null);
      try {
        const { sessionId } = await createClassroomSession(title);
        router.push(`/teacher/${sessionId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "เปิดห้องไม่สำเร็จ");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-gold bg-amber px-4 py-2.5 font-bold text-on-amber transition active:scale-95"
      >
        <Plus className="h-4 w-4" /> เปิดห้องเรียน
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <form
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-6"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <p className="text-lg font-bold text-text">เปิดห้องเรียน</p>
            <label className="mt-4 block text-sm text-text2" htmlFor="room-title">
              ชื่อห้อง (ไม่บังคับ)
            </label>
            <input
              id="room-title"
              autoFocus
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ม.2/3 วิทยาศาสตร์"
              className="mt-1.5 w-full rounded-xl border border-border bg-track px-3 py-2.5 text-text placeholder:text-text3"
            />
            {error && <p className="mt-2 text-sm text-red">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-border py-3 text-sm text-text2"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-xl border border-gold bg-amber py-3 font-bold text-on-amber disabled:opacity-50"
              >
                {pending ? "กำลังเปิด…" : "เปิดห้อง"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
