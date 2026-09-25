"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { getBossRaidJoinCodeForClassroom, setClassroomIdentity } from "../actions";
import { joinFocusSession } from "@/app/teacher/focusActions";
import { isFocusNotRunning } from "@/lib/classroom/focusErrors";
import {
  useClassroomLobby,
  type ClassroomParticipant,
  type ClassroomSession,
} from "@/lib/classroom/useClassroomLobby";
import { isFocusRunning, useFocusSession } from "@/lib/classroom/useFocusSession";
import { resolveRosterPet, rosterDisplayName } from "@/lib/classroom/roster";
import FocusStudentView from "@/components/classroom/FocusStudentView";
import RosterAvatar from "@/components/classroom/RosterAvatar";

export default function StudentLobbyClient({
  sessionId,
  userId,
  initialSession,
  initialParticipants,
}: {
  sessionId: string;
  userId: string;
  initialSession: ClassroomSession;
  initialParticipants: ClassroomParticipant[];
}) {
  const router = useRouter();
  // track Presence เป็นตัวเอง — จอครูใช้โชว์ว่าใครหลุด และสุ่มชื่อเฉพาะคนที่ออนไลน์
  const { session, participants, rosterDenied, connected, refetch } = useClassroomLobby(
    sessionId,
    { session: initialSession, participants: initialParticipants },
    { trackPresenceAs: userId }
  );
  const { focusSession, myParticipant, participantsLoaded, connected: focusConnected } =
    useFocusSession(sessionId, session?.active_focus_session_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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

  if (!session || rosterDenied) {
    return (
      <main className="mx-auto w-full max-w-sm px-4 py-12 text-center">
        <p className="text-text2">{rosterDenied ? "คุณไม่ได้อยู่ในห้องนี้แล้ว" : "ไม่พบห้อง"}</p>
        <Link href="/classroom/join" className="mt-4 inline-block text-sm text-gold-hi underline">
          กรอกรหัสห้องใหม่
        </Link>
      </main>
    );
  }

  if (focusRunning && focusSession) {
    return <FocusStudentView startedAt={focusSession.started_at} connected={focusConnected} />;
  }

  const me = participants.find((p) => p.user_id === userId);
  const classmates = participants.filter((p) => p.user_id !== userId);

  // ต้องกรอกชื่อจริงก่อน — ครูเห็นแค่ username (ชื่อเล่นที่ตั้งเอง) จะไม่รู้ว่าเป็นใคร
  if (!ended && me && (!me.display_name || editing)) {
    return (
      <IdentityForm
        me={me}
        canCancel={!!me.display_name}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await refetch();
        }}
        sessionId={sessionId}
      />
    );
  }

  const myPet = me ? resolveRosterPet(me) : null;
  const status = ended
    ? "ห้องนี้ปิดแล้ว"
    : session.current_activity === "name_picker"
      ? "ครูกำลังสุ่มรายชื่อ… ดูผลบนจอหน้าห้อง"
      : session.current_activity === "boss_raid"
        ? "กำลังพาเข้า Boss Raid…"
        : session.current_activity === "focus_mode"
          ? "กำลังเข้าคาบตั้งใจ…"
          : "รอครูเริ่มกิจกรรม";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col items-center px-4 pb-24 pt-10 text-center">
      <p className="text-sm text-text3">{session.title ?? "ห้องเรียน"}</p>

      {me && (
        <>
          <div className="mt-4 animate-evolve-pop">
            <RosterAvatar pet={myPet} name={rosterDisplayName(me)} size={168} />
          </div>
          <p className="mt-3 text-sm font-bold text-good">เข้าห้องแล้ว</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={ended}
            className="mt-1 flex items-center gap-1.5 text-xl font-bold text-gold-hi"
          >
            {me.student_number !== null && <span>{me.student_number}.</span>}
            {me.display_name}
            {!ended && <Pencil className="h-4 w-4 text-text3" />}
          </button>
          {myPet && (
            <p className="text-sm text-text3">คู่หู: {myPet.nickname ?? myPet.speciesName}</p>
          )}
        </>
      )}

      <div className="mt-8 w-full rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex items-center justify-center gap-2">
          {!ended && session.current_activity === null && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber" />
            </span>
          )}
          <p className="font-bold text-text">{status}</p>
        </div>
        {!connected && !ended && <p className="mt-1 text-xs text-warn">กำลังเชื่อมต่อ…</p>}
      </div>

      {classmates.length > 0 && !ended && (
        <div className="mt-6 w-full">
          <p className="text-sm text-text3">เพื่อนในห้อง {classmates.length} คน</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {classmates.slice(0, 30).map((p) => (
              <RosterAvatar key={p.user_id} pet={resolveRosterPet(p)} name={rosterDisplayName(p)} size={40} />
            ))}
            {classmates.length > 30 && (
              <span className="flex h-10 items-center px-2 text-xs text-text3">+{classmates.length - 30}</span>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red">{error}</p>}
    </main>
  );
}

function IdentityForm({
  sessionId,
  me,
  canCancel,
  onCancel,
  onSaved,
}: {
  sessionId: string;
  me: ClassroomParticipant;
  canCancel: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(me.display_name ?? "");
  const [number, setNumber] = useState(me.student_number?.toString() ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto w-full max-w-sm px-4 pb-24 pt-10">
      <div className="flex flex-col items-center text-center">
        <RosterAvatar pet={resolveRosterPet(me)} name={name || rosterDisplayName(me)} size={96} />
        <h1 className="mt-4 text-2xl font-bold text-gold-hi">บอกครูหน่อยว่าเราคือใคร</h1>
        <p className="mt-1 text-sm text-text3">ครูจะเห็นชื่อนี้บนจอหน้าห้อง</p>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            try {
              const n = number.trim() === "" ? null : Number(number);
              await setClassroomIdentity(sessionId, name, n);
              await onSaved();
            } catch (err) {
              setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
            }
          });
        }}
      >
        <div>
          <label htmlFor="cls-name" className="text-sm text-text2">
            ชื่อจริง / ชื่อเล่น
          </label>
          <input
            id="cls-name"
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="ด.ญ.มายด์ ใจดี"
            className="mt-1.5 w-full rounded-xl border border-border bg-track px-4 py-3 text-lg text-text placeholder:text-text3"
          />
        </div>
        <div>
          <label htmlFor="cls-number" className="text-sm text-text2">
            เลขที่ (ถ้ามี)
          </label>
          <input
            id="cls-number"
            inputMode="numeric"
            pattern="[0-9]*"
            value={number}
            maxLength={2}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="12"
            className="mt-1.5 w-28 rounded-xl border border-border bg-track px-4 py-3 text-center text-lg text-text placeholder:text-text3"
          />
        </div>
        {error && <p className="text-sm text-red">{error}</p>}
        <div className="flex gap-2 pt-2">
          {canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-2xl border border-border py-3.5 text-text2"
            >
              ยกเลิก
            </button>
          )}
          <button
            type="submit"
            disabled={pending || name.trim().length === 0}
            className="flex-1 rounded-2xl border border-gold bg-amber py-3.5 text-lg font-bold text-on-amber transition active:scale-95 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "เข้าห้อง"}
          </button>
        </div>
      </form>
    </main>
  );
}
