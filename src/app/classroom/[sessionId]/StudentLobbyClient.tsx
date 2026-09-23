"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getBossRaidJoinCodeForClassroom } from "../actions";
import { useClassroomLobby, type ClassroomSession } from "@/lib/classroom/useClassroomLobby";

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
  const [error, setError] = useState<string | null>(null);
  const redirecting = useRef(false);

  useEffect(() => {
    if (!session) return;
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
  }, [session, router]);

  if (!session) {
    return <main className="mx-auto max-w-sm px-4 py-12 text-center text-text3">ไม่พบห้อง</main>;
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-gold-hi">ห้องเรียน</h1>
      <p className="mt-1 text-xs text-text3">{connected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ…"}</p>

      {session.status === "ended" && <p className="mt-6 text-text3">ห้องนี้ปิดแล้ว</p>}

      {session.status !== "ended" && session.current_activity === null && (
        <p className="mt-6 text-text3">รอครูเริ่มกิจกรรม…</p>
      )}

      {session.current_activity === "name_picker" && (
        <p className="mt-6 text-text3">ครูกำลังสุ่มรายชื่อ… รอดูผลบนจอ</p>
      )}

      {session.current_activity === "boss_raid" && (
        <p className="mt-6 text-text3">กำลังพาเข้าห้อง Boss Raid…</p>
      )}

      {error && <p className="mt-4 text-sm text-red">{error}</p>}
    </main>
  );
}
