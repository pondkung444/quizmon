"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Pencil, Shield } from "lucide-react";
import {
  getBossRaidJoinCodeForClassroom,
  getClassroomMySummary,
  setClassroomIdentity,
} from "../actions";
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
import ClassroomQmonLoadout from "@/components/classroom/ClassroomQmonLoadout";
import MySessionRecap from "@/components/classroom/MySessionRecap";
import type { MyClassroomSummary } from "@/lib/classroom/mySummary";

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
  const { session, participants, onlineIds, rosterDenied, connected, refetch } = useClassroomLobby(
    sessionId,
    { session: initialSession, participants: initialParticipants },
    { trackPresenceAs: userId }
  );
  const { focusSession, myParticipant, participantsLoaded } =
    useFocusSession(sessionId, session?.active_focus_session_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [summary, setSummary] = useState<MyClassroomSummary | null>(null);
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

  // ผลของตัวเองในคาบ — โหลดใหม่ทุกครั้งที่กิจกรรม/สถานะห้องเปลี่ยน (Raid จบ, คาบตั้งใจจบ, ครูสุ่มชื่อ)
  const loadSummary = useCallback(async () => {
    const s = await getClassroomMySummary(sessionId);
    if (s) setSummary(s);
  }, [sessionId]);
  const activityKey = `${session?.status}|${session?.current_activity}|${session?.active_boss_raid_session_id}|${focusSession?.status}`;
  useEffect(() => {
    let cancelled = false;
    void getClassroomMySummary(sessionId).then((s) => {
      if (!cancelled && s) setSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, activityKey]);

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

  const me = participants.find((p) => p.user_id === userId);

  if (focusRunning && focusSession) {
    return (
      <FocusStudentView
        key={focusSession.id}
        focusSessionId={focusSession.id}
        joined={!!myParticipant}
        pet={me ? resolveRosterPet(me) : null}
      />
    );
  }

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
  const waiting = !ended && session.current_activity === null;
  const status = ended
    ? "คาบนี้จบแล้ว"
    : session.current_activity === "name_picker"
      ? "ครูกำลังสุ่มรายชื่อ… ดูผลบนจอหน้าห้อง"
      : session.current_activity === "boss_raid"
        ? "กำลังพาเข้า Boss Raid…"
        : session.current_activity === "focus_mode"
          ? "กำลังเข้าคาบตั้งใจ…"
          : "รอครูเริ่มกิจกรรม";

  // ออนไลน์ก่อน แล้วตามเวลาเข้า — onlineIds null = Presence ยังไม่ sync ถือว่าทุกคนออนไลน์ (ไม่หรี่ทั้งห้อง)
  const isOnline = (id: string) => onlineIds === null || onlineIds.has(id);
  const sortedClassmates = [...classmates].sort(
    (a, b) => Number(isOnline(b.user_id)) - Number(isOnline(a.user_id))
  );
  const onlineCount = classmates.filter((p) => isOnline(p.user_id)).length;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 pb-28 pt-6">
      <header className="flex w-full items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text3">ห้องเรียน</p>
          <h1 className="truncate text-lg font-bold text-text">{session.title ?? "ห้องเรียน"}</h1>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
            ended ? "bg-track text-text3" : connected ? "bg-good/15 text-good" : "bg-warn/15 text-warn"
          }`}
        >
          {!ended && <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-good" : "bg-warn"}`} />}
          {ended ? "จบคาบ" : connected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ…"}
        </span>
      </header>

      {me && (
        <section className="w-full overflow-hidden rounded-3xl border border-gold-dim bg-card">
          <div className="flex items-center gap-4 p-4">
            <div className="animate-evolve-pop">
              <RosterAvatar pet={myPet} name={rosterDisplayName(me)} size={104} />
            </div>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={ended}
                className="flex max-w-full items-center gap-1.5 text-left text-xl font-bold text-gold-hi"
              >
                <span className="truncate">
                  {me.student_number !== null && `${me.student_number}. `}
                  {rosterDisplayName(me)}
                </span>
                {!ended && <Pencil className="h-4 w-4 shrink-0 text-text3" />}
              </button>
              {myPet && (
                <p className="truncate text-sm text-text2">
                  คู่หู: <span className="font-bold text-text">{myPet.nickname ?? myPet.speciesName}</span>
                </p>
              )}
              {!ended && (
                <button
                  type="button"
                  onClick={() => setLoadoutOpen((v) => !v)}
                  aria-expanded={loadoutOpen}
                  className={`mt-2.5 flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-bold transition active:scale-95 ${
                    loadoutOpen ? "border-gold bg-amber/15 text-gold-hi" : "border-border bg-track text-text"
                  }`}
                >
                  <Shield className="h-4 w-4" />
                  จัดทีม Qmon
                  <ChevronDown className={`h-4 w-4 transition ${loadoutOpen ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
          </div>

          {loadoutOpen && !ended && (
            <div className="border-t border-border p-4">
              <ClassroomQmonLoadout
                sessionId={sessionId}
                chosenPetId={summary?.pet_id ?? null}
                onChanged={() => {
                  void refetch();
                  void loadSummary();
                }}
              />
            </div>
          )}
        </section>
      )}

      <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5">
        {waiting && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber" />
          </span>
        )}
        <p className="font-bold text-text">{status}</p>
      </div>

      {summary && <MySessionRecap summary={summary} classEnded={ended} />}

      {classmates.length > 0 && (
        <section className="w-full rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-bold text-text">เพื่อนในห้อง</h2>
            <p className="text-xs text-text3">
              {ended ? `${classmates.length} คน` : `ออนไลน์ ${onlineCount}/${classmates.length}`}
            </p>
          </div>
          <ul className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5">
            {sortedClassmates.slice(0, 40).map((p) => {
              const online = ended || isOnline(p.user_id);
              return (
                <li key={p.user_id} className="flex min-w-0 flex-col items-center">
                  <div className="relative">
                    <RosterAvatar pet={resolveRosterPet(p)} name={rosterDisplayName(p)} size={56} dim={!online} />
                    {!ended && online && (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-good" />
                    )}
                  </div>
                  <span className={`mt-1 w-full truncate text-center text-[11px] ${online ? "text-text2" : "text-text3"}`}>
                    {rosterDisplayName(p)}
                  </span>
                </li>
              );
            })}
          </ul>
          {classmates.length > 40 && (
            <p className="mt-2 text-center text-xs text-text3">และอีก {classmates.length - 40} คน</p>
          )}
        </section>
      )}

      {ended && (
        <Link href="/pet" className="text-sm text-gold-hi underline">
          กลับหน้าหลัก
        </Link>
      )}

      {error && <p className="text-sm text-red">{error}</p>}
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
