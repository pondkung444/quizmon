"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { archiveTeacherClass, renameTeacherClass } from "../../actions";

// ชื่อห้อง (แก้ได้) + ซ่อนห้อง — ซ่อน = archive ไม่ลบประวัติ
export function ClassNameEditor({ classId, name }: { classId: string; name: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        className="group flex min-w-0 items-center gap-2 text-left"
      >
        <h1 className="truncate text-2xl font-bold text-gold-hi">{name}</h1>
        <Pencil className="h-4 w-4 shrink-0 text-text3 transition group-hover:text-gold-hi" />
      </button>
    );
  }

  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() === name) return setEditing(false);
        start(async () => {
          setError(null);
          try {
            await renameTeacherClass(classId, value);
            setEditing(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "เปลี่ยนชื่อไม่สำเร็จ");
          }
        });
      }}
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={value}
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-gold-dim bg-track px-3 py-1.5 text-xl font-bold text-gold-hi"
        />
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="rounded-xl border border-gold bg-amber px-3 text-sm font-bold text-on-amber disabled:opacity-50"
        >
          บันทึก
        </button>
        <button type="button" onClick={() => setEditing(false)} className="px-2 text-sm text-text3">
          ยกเลิก
        </button>
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
    </form>
  );
}

export function ArchiveClassButton({ classId, name }: { classId: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="text-xs text-text3 underline-offset-2 transition hover:text-red hover:underline"
      >
        ซ่อนห้องนี้
      </button>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-lg font-bold text-text">ซ่อน {name}?</p>
            <p className="mt-2 text-sm text-text3">
              ห้องจะหายจากหน้าแรก แต่ประวัติคาบยังอยู่ครบ ตั้งห้องชื่อเดิมใหม่ได้
            </p>
            {error && <p className="mt-2 text-sm text-red">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-xl border border-border py-3 text-sm text-text2"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    try {
                      await archiveTeacherClass(classId);
                      router.push("/teacher");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "ซ่อนห้องไม่สำเร็จ");
                    }
                  })
                }
                className="flex-1 rounded-xl bg-red py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                ซ่อนห้อง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
