"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Play, Plus, X } from "lucide-react";
import { createTeacherClass, startClassSession } from "./actions";

type ClassOption = { id: string; name: string; openSessionId: string | null };

// กด "เริ่มคาบ" → เปิดห้องทันที (หรือกลับห้องเดิมถ้ายังเปิดอยู่)
// ถ้ามีคาบของห้องอื่นค้าง RPC ตอบ other_session_open → ถามครูก่อนปิดห้องนั้น
function useStartClass() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);

  function run(classId: string, endOtherOpen = false) {
    start(async () => {
      setError(null);
      try {
        const res = await startClassSession(classId, endOtherOpen);
        if (res.ok) {
          setConfirmFor(null);
          router.push(`/teacher/${res.sessionId}`);
        } else {
          setConfirmFor(classId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "เริ่มคาบไม่สำเร็จ");
      }
    });
  }

  const confirmDialog = confirmFor && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
        <p className="text-lg font-bold text-text">มีห้องอื่นยังเปิดอยู่</p>
        <p className="mt-2 text-sm text-text3">
          ปิดคาบเดิมแล้วเริ่มคาบใหม่เลยไหม? นักเรียนที่ยังอยู่ในคาบเดิมจะออกจากห้อง
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmFor(null)}
            className="flex-1 rounded-xl border border-border py-3 text-sm text-text2"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(confirmFor, true)}
            className="flex-1 rounded-xl border border-gold bg-amber py-3 text-sm font-bold text-on-amber disabled:opacity-50"
          >
            {pending ? "กำลังเปิด…" : "ปิดคาบเดิม แล้วเริ่ม"}
          </button>
        </div>
      </div>
    </div>
  );

  return { run, pending, error, setError, confirmDialog };
}

export function StartClassButton({
  classId,
  openSessionId,
  compact = false,
}: {
  classId: string;
  openSessionId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const { run, pending, error, confirmDialog } = useStartClass();
  const isOpen = openSessionId !== null;

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (openSessionId) router.push(`/teacher/${openSessionId}`);
          else run(classId);
        }}
        className={`flex items-center justify-center gap-1.5 rounded-xl font-bold transition active:scale-95 disabled:opacity-50 ${
          isOpen
            ? "border border-good bg-good/15 text-good"
            : "border border-gold bg-amber text-on-amber"
        } ${compact ? "px-3 py-2 text-sm" : "px-5 py-3"}`}
      >
        <Play className="h-4 w-4" />
        {pending ? "กำลังเปิด…" : isOpen ? "กลับเข้าห้อง" : "เริ่มคาบ"}
      </button>
      {error && <p className="mt-1 text-xs text-red">{error}</p>}
      {confirmDialog}
    </>
  );
}

// ปุ่ม "เริ่มคาบ" ใหญ่ด้านบน — เลือกห้อง หรือเพิ่มห้องใหม่แล้วเริ่มเลย
export function StartClassPicker({ classes }: { classes: ClassOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, startCreate] = useTransition();
  const { run, pending, error, setError, confirmDialog } = useStartClass();
  const busy = pending || creating;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-gold bg-amber px-5 py-3 font-bold text-on-amber transition active:scale-95"
      >
        <Play className="h-4 w-4" /> เริ่มคาบ
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:px-4">
          <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold text-text">เริ่มคาบกับห้องไหน</p>
              <button type="button" aria-label="ปิด" onClick={() => setOpen(false)} className="p-1 text-text3">
                <X className="h-5 w-5" />
              </button>
            </div>

            {classes.length > 0 && (
              <ul className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto">
                {classes.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        c.openSessionId ? router.push(`/teacher/${c.openSessionId}`) : run(c.id)
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-border bg-bg/40 px-4 py-3.5 text-left transition hover:border-gold-dim disabled:opacity-50"
                    >
                      <span className="font-bold text-text">{c.name}</span>
                      <span className={`text-sm ${c.openSessionId ? "text-good" : "text-gold-hi"}`}>
                        {c.openSessionId ? "เปิดอยู่ · กลับเข้าห้อง" : "เริ่ม"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="mt-4 border-t border-border pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                startCreate(async () => {
                  setError(null);
                  try {
                    const { classId } = await createTeacherClass(newName);
                    setNewName("");
                    run(classId);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "เพิ่มห้องไม่สำเร็จ");
                  }
                });
              }}
            >
              <label htmlFor="new-class" className="text-sm text-text2">
                {classes.length === 0 ? "ตั้งชื่อห้องแรกของคุณ" : "หรือเพิ่มห้องใหม่"}
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="new-class"
                  value={newName}
                  maxLength={60}
                  autoFocus={classes.length === 0}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ม.3/1 วิทยาศาสตร์"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-track px-3 py-2.5 text-text placeholder:text-text3"
                />
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="flex items-center gap-1 rounded-xl border border-gold bg-amber px-4 font-bold text-on-amber disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> เริ่ม
                </button>
              </div>
            </form>
            {error && <p className="mt-2 text-sm text-red">{error}</p>}
          </div>
        </div>
      )}
      {confirmDialog}
    </>
  );
}

// เพิ่มห้อง (ไม่เริ่มคาบ) — การ์ดเส้นประในหน้าแรก
export function AddClassCard() {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-[148px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-sm text-text3 transition hover:border-gold-dim hover:text-gold-hi"
      >
        <Plus className="h-5 w-5" />
        เพิ่มห้องเรียน
      </button>
    );
  }

  return (
    <form
      className="flex min-h-[148px] flex-col justify-center gap-2 rounded-2xl border border-gold-dim bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          try {
            await createTeacherClass(name);
            setName("");
            setEditing(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "เพิ่มห้องไม่สำเร็จ");
          }
        });
      }}
    >
      <input
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        placeholder="ม.3/1 วิทยาศาสตร์"
        className="rounded-xl border border-border bg-track px-3 py-2 text-text placeholder:text-text3"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex-1 rounded-xl border border-border py-2 text-sm text-text2"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="flex-1 rounded-xl border border-gold bg-amber py-2 text-sm font-bold text-on-amber disabled:opacity-50"
        >
          เพิ่ม
        </button>
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
    </form>
  );
}
