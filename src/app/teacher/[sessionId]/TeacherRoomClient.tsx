"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import {
  endClassroomSession,
  launchBossRaidFromClassroom,
  pickRandomStudent,
  setClassroomActivityNamePicker,
  type PickedStudent,
} from "../actions";
import { endFocusMode, launchFocusMode } from "../focusActions";
import {
  useClassroomLobby,
  type ClassroomParticipant,
  type ClassroomSession,
} from "@/lib/classroom/useClassroomLobby";
import { isFocusRunning, useFocusSession } from "@/lib/classroom/useFocusSession";
import FocusTeacherPanel from "@/components/classroom/FocusTeacherPanel";

export default function TeacherRoomClient({
  sessionId,
  initialSession,
  initialParticipants,
}: {
  sessionId: string;
  initialSession: ClassroomSession;
  initialParticipants: ClassroomParticipant[];
}) {
  const router = useRouter();
  const { session, participants, connected, refetch } = useClassroomLobby(sessionId, {
    session: initialSession,
    participants: initialParticipants,
  });
  const { focusSession, participantCount } = useFocusSession(
    sessionId,
    session?.active_focus_session_id ?? null
  );
  const focusRunning = isFocusRunning(session, focusSession);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickedLog, setPickedLog] = useState<Array<PickedStudent & { pickedAt: string }>>([]);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const joinUrl =
    typeof window !== "undefined" && session?.join_code
      ? `${window.location.origin}/classroom/join?code=${session.join_code}`
      : "";

  // mirror src/components/social/AddFriendView.tsx — dynamic import ตัวเดียวกับที่ main มีอยู่แล้ว
  // (ไม่เพิ่ม dep ใหม่ซ้ำ qrcode ตัวนี้ถูกเพิ่มเข้า main แล้วระหว่างที่พัฒนาฟีเจอร์นี้)
  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const QRCode = await import("qrcode");
        const dataUrl = await QRCode.toDataURL(joinUrl, {
          width: 220,
          margin: 4,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQrImage(dataUrl);
      } catch {
        /* สร้าง QR ไม่สำเร็จ — ครูยังใช้รหัส 6 หลักที่โชว์คู่กันได้ */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  if (!session) {
    return <main className="mx-auto max-w-sm px-4 py-12 text-center text-text3">ไม่พบห้อง</main>;
  }

  const ended = session.status === "ended";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gold-hi">ห้องเรียน</h1>
        <span className="text-xs text-text3">{connected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ…"}</span>
      </div>

      {ended ? (
        <p className="mt-6 rounded-xl border border-border bg-card px-4 py-6 text-center text-text3">
          ห้องนี้ปิดแล้ว
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-6">
            {qrImage && (
              <Image
                src={qrImage}
                alt="QR เข้าห้องเรียน"
                width={180}
                height={180}
                unoptimized
                className="rounded-xl"
              />
            )}
            <p className="font-mono text-3xl tracking-[0.3em] text-gold-hi">{session.join_code}</p>
            <p className="text-sm text-text3">ให้นักเรียนสแกน QR หรือกรอกรหัสที่ /classroom/join</p>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-sm text-text2">นักเรียนในห้อง: {participants.length} คน</p>
          </div>

          {focusRunning && focusSession && (
            <FocusTeacherPanel
              startedAt={focusSession.started_at}
              participantCount={participantCount}
              pending={pending}
              onStop={() =>
                start(async () => {
                  setError(null);
                  const res = await endFocusMode(focusSession.id);
                  if (res.ok) await refetch();
                  else setError(res.error);
                })
              }
            />
          )}

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              disabled={pending || focusRunning}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    await setClassroomActivityNamePicker(sessionId);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "เริ่มสุ่มรายชื่อไม่สำเร็จ");
                  }
                })
              }
              className="rounded-xl border border-gold bg-amber px-4 py-3 font-bold text-track transition active:scale-95 disabled:opacity-50"
            >
              สุ่มรายชื่อ
            </button>
            <button
              type="button"
              disabled={pending || focusRunning}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    const { bossRaidSessionId } = await launchBossRaidFromClassroom(sessionId);
                    router.push(`/boss-raid/${bossRaidSessionId}/tv`);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "เปิด Boss Raid ไม่สำเร็จ");
                  }
                })
              }
              className="rounded-xl border border-gold bg-amber px-4 py-3 font-bold text-track transition active:scale-95 disabled:opacity-50"
            >
              Boss Raid
            </button>
            <button
              type="button"
              disabled={pending || focusRunning}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await launchFocusMode(sessionId);
                  if (res.ok) {
                    await refetch();
                  } else {
                    setError(
                      res.code.includes("classroom_activity_busy") && focusSession?.status === "running"
                        ? "คาบตั้งใจกำลังดำเนินอยู่"
                        : res.error
                    );
                    await refetch();
                  }
                })
              }
              className="rounded-xl border border-gold bg-amber px-4 py-3 font-bold text-track transition active:scale-95 disabled:opacity-50"
            >
              เริ่มคาบตั้งใจ
            </button>
          </div>
          {focusRunning && (
            <p className="mt-2 text-xs text-text3">
              กำลังคาบตั้งใจอยู่ — หยุดคาบก่อน จึงจะเริ่มกิจกรรมอื่นได้
            </p>
          )}

          {session.current_activity === "name_picker" && (
            <div className="mt-4 rounded-xl border border-border bg-card px-4 py-4">
              <button
                type="button"
                disabled={pending || participants.length === 0}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    try {
                      const picked = await pickRandomStudent(sessionId);
                      setPickedLog((prev) => [{ ...picked, pickedAt: new Date().toISOString() }, ...prev]);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "สุ่มรายชื่อไม่สำเร็จ");
                    }
                  })
                }
                className="w-full rounded-xl border border-gold bg-amber px-4 py-3 font-bold text-track transition active:scale-95 disabled:opacity-50"
              >
                {pending ? "กำลังสุ่ม…" : "กดสุ่ม"}
              </button>

              {pickedLog.length > 0 && (
                <div className="mt-4">
                  <p className="text-lg font-bold text-gold-hi">{pickedLog[0].username ?? pickedLog[0].userId}</p>
                  {pickedLog.length > 1 && (
                    <ul className="mt-2 space-y-1 text-sm text-text3">
                      {pickedLog.slice(1).map((p, i) => (
                        <li key={`${p.userId}-${p.pickedAt}-${i}`}>{p.username ?? p.userId}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    await endClassroomSession(sessionId);
                    router.push("/teacher");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "ปิดห้องไม่สำเร็จ");
                  }
                })
              }
              className="rounded-xl border border-border px-4 py-2 text-sm text-text3 transition hover:border-red hover:text-red"
            >
              ปิดห้องเรียน
            </button>
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm text-red">{error}</p>}
    </main>
  );
}
