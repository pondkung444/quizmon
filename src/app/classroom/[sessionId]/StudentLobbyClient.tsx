"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getBossRaidJoinCodeForClassroom } from "../actions";
import { joinFocusSession } from "@/app/teacher/focusActions";
import { isFocusNotRunning } from "@/lib/classroom/focusErrors";
import { useClassroomLobby, type ClassroomSession } from "@/lib/classroom/useClassroomLobby";
import { isFocusRunning, useFocusSession } from "@/lib/classroom/useFocusSession";
import FocusStudentView from "@/components/classroom/FocusStudentView";

export default function StudentLobbyClient({
  sessionId,
  initialSession,
}: {
  sessionId: string;
  initialSession: ClassroomSession;
}) {
  const router = useRouter();
  const { session, connected } = useClassroomLobby(sessionId, {
    session: initialSession,
    participants: [],
  });
  const { focusSession, myParticipant, participantsLoaded, connected: focusConnected } =
    useFocusSession(sessionId, session?.active_focus_session_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const redirecting = useRef(false);
  const joinedFocusId = useRef<string | null>(null);

  // ลำดับความสำคัญ: ห้องจบ > Focus กำลังรัน > การแสดงผลเดิม (รวม redirect ของ boss_raid)
  const ended = session?.status === "ended";
  const focusRunning = !ended && isFocusRunning(session, focusSession);

  useEffect(() => {
    if (!session || ended || focusRunning) return;
    if (
      session.current_activity === "boss_raid" &&
      session.active_boss_raid_session_id &&
      !redirecting.current
    ) {
      redirecting.current = true;
      void (async () => {
        try {
          const code = await getBossRaidJoinCodeForClassroom(session.active_boss_raid_session_id!);
          router.push(`/boss-raid/join?code=${code}`);
        } catch (e) {
          redirecting.current = false;
          setError(e instanceof Error ? e.message : "เข้าห้อง Boss Raid ไม่สำเร็จ");
        }
      })();
    }
  }, [session, router, ended, focusRunning]);

  // late-joiner: เข้าห้องหลังครูเริ่มคาบ → ยังไม่มีแถวผู้เข้าร่วม ให้ join ครั้งเดียวต่อรอบ
  const focusId = focusRunning ? focusSession!.id : null;
  useEffect(() => {
    if (!focusId || !participantsLoaded || myParticipant) return;
    if (joinedFocusId.current === focusId) return;
    joinedFocusId.current = focusId;
    void (async () => {
      const res = await joinFocusSession(focusId);
      // คาบเพิ่งจบไปพอดี — เงียบ ไม่ต้องบอกอะไร (หน้าจอจะกลับปกติเองผ่าน realtime)
      if (!res.ok && !isFocusNotRunning(res.code)) setError(res.error);
    })();
  }, [focusId, participantsLoaded, myParticipant]);

  if (!session) {
    return <main className="mx-auto w-full max-w-sm px-4 py-12 text-center text-text3">ไม่พบห้อง</main>;
  }

  if (focusRunning && focusSession) {
    return <FocusStudentView startedAt={focusSession.started_at} connected={focusConnected} />;
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-gold-hi">ห้องเรียน</h1>
      <p className="mt-1 text-xs text-text3">{connected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ…"}</p>

      {ended && <p className="mt-6 text-text3">ห้องนี้ปิดแล้ว</p>}

      {!ended && session.current_activity === null && (
        <p className="mt-6 text-text3">รอครูเริ่มกิจกรรม…</p>
      )}

      {session.current_activity === "name_picker" && (
        <p className="mt-6 text-text3">ครูกำลังสุ่มรายชื่อ… รอดูผลบนจอ</p>
      )}

      {!ended && session.current_activity === "focus_mode" && (
        <p className="mt-6 text-text3">กำลังเข้าคาบตั้งใจ…</p>
      )}

      {session.current_activity === "boss_raid" && (
        <p className="mt-6 text-text3">กำลังพาเข้าห้อง Boss Raid…</p>
      )}

      {error && <p className="mt-4 text-sm text-red">{error}</p>}
    </main>
  );
}
