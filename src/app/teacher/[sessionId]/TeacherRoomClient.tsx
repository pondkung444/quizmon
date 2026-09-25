"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Dices,
  Maximize2,
  Pencil,
  Swords,
  Target,
  UserMinus,
  X,
} from "lucide-react";
import {
  endClassroomSession,
  kickClassroomParticipant,
  launchBossRaidFromClassroom,
  pickRandomStudent,
  renameClassroomSession,
  setClassroomActivityNamePicker,
  type PickedStudent,
} from "../actions";
import { clearClassroomActivity, endFocusMode, launchFocusMode } from "../focusActions";
import { closeBossRaid } from "@/app/boss-raid/actions";
import {
  useClassroomLobby,
  type ClassroomParticipant,
  type ClassroomSession,
} from "@/lib/classroom/useClassroomLobby";
import { isFocusRunning, useFocusSession } from "@/lib/classroom/useFocusSession";
import {
  formatJoinCode,
  resolveRosterPet,
  rosterDisplayName,
  sortByStudentNumber,
  STAGE_LABEL,
} from "@/lib/classroom/roster";
import FocusTeacherPanel, { FocusSummaryCard } from "@/components/classroom/FocusTeacherPanel";
import RosterAvatar from "@/components/classroom/RosterAvatar";

// จอครู — ออกแบบให้ฉายโปรเจกเตอร์ได้: รหัสใหญ่ฝั่งซ้าย, รายชื่อ+Qmon realtime ฝั่งขวา, กิจกรรมด้านล่าง
// ไม่มี QR แล้ว (รหัสตัวเลข 6 หลักกรอกง่ายกว่า — ดู migration 20260925090000_classroom_ux_v2)

const NEW_BADGE_MS = 8000;
const PICK_SPIN_MS = 1400;
const noopSubscribe = () => () => {};

type SortMode = "number" | "recent";

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
  const { session, participants, onlineIds, connected, refetch } = useClassroomLobby(sessionId, {
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
  const [sortMode, setSortMode] = useState<SortMode>("number");
  const [projector, setProjector] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmCloseRaid, setConfirmCloseRaid] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [dismissedFocusId, setDismissedFocusId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // origin ฝั่ง client เท่านั้น (SSR ได้ "" แล้ว hydrate เป็นค่าจริง)
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");

  // ---- ไฮไลต์คนที่เพิ่งเข้า (ไม่นับรายชื่อตอนโหลดหน้า) ----
  const seenIds = useRef<Set<string>>(new Set(initialParticipants.map((p) => p.user_id)));
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const incoming = participants.map((p) => p.user_id).filter((id) => !seenIds.current.has(id));
    if (incoming.length === 0) return;
    incoming.forEach((id) => seenIds.current.add(id));
    setFreshIds((prev) => new Set([...prev, ...incoming]));
    const t = setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        incoming.forEach((id) => next.delete(id));
        return next;
      });
    }, NEW_BADGE_MS);
    return () => clearTimeout(t);
  }, [participants]);

  // Presence มีความหมายเฉพาะตอนนักเรียนอยู่หน้าห้อง — ช่วง Raid นักเรียนย้ายไปหน้าอื่น (จะดูเหมือนหลุดทุกคน)
  const presenceMeaningful =
    onlineIds !== null &&
    (session?.current_activity === null || session?.current_activity === "name_picker" || focusRunning);
  const isOnline = (id: string) => !presenceMeaningful || onlineIds!.has(id);
  const onlineCount = participants.filter((p) => isOnline(p.user_id)).length;

  const sorted = useMemo(
    () => (sortMode === "number" ? sortByStudentNumber(participants) : participants),
    [participants, sortMode]
  );

  // ---- สุ่มรายชื่อ: หมุนชื่อผ่านตาก่อนประกาศผล ----
  const [pickedLog, setPickedLog] = useState<Array<PickedStudent & { pickedAt: string }>>([]);
  const [spinName, setSpinName] = useState<ClassroomParticipant | null>(null);
  const [spinning, setSpinning] = useState(false);

  function runPick() {
    if (spinning || participants.length === 0) return;
    setError(null);
    setSpinning(true);
    const pool = participants.filter((p) => isOnline(p.user_id));
    const spinPool = pool.length > 0 ? pool : participants;
    const tick = setInterval(() => {
      setSpinName(spinPool[Math.floor(Math.random() * spinPool.length)]);
    }, 80);
    const minDelay = new Promise((r) => setTimeout(r, PICK_SPIN_MS));
    void (async () => {
      try {
        const [picked] = await Promise.all([
          pickRandomStudent(sessionId, presenceMeaningful ? pool.map((p) => p.user_id) : undefined),
          minDelay,
        ]);
        setPickedLog((prev) => [{ ...picked, pickedAt: new Date().toISOString() }, ...prev]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "สุ่มรายชื่อไม่สำเร็จ");
      } finally {
        clearInterval(tick);
        setSpinName(null);
        setSpinning(false);
      }
    })();
  }

  if (!session) {
    return <main className="mx-auto max-w-sm px-4 py-12 text-center text-text3">ไม่พบห้อง</main>;
  }

  const ended = session.status === "ended";
  const joinHost = origin ? `${origin.replace(/^https?:\/\//, "")}/join` : "quizmon.xyz/join";
  const joinLink = origin ? `${origin}/join?code=${session.join_code}` : "";
  const byId = new Map(participants.map((p) => [p.user_id, p]));
  const latestPick = pickedLog[0] ? byId.get(pickedLog[0].userId) : undefined;

  function act(fn: () => Promise<void>) {
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
      }
    });
  }

  if (ended) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gold-hi">{session.title ?? "ห้องเรียน"}</h1>
        <p className="mt-3 text-text2">ห้องนี้ปิดแล้ว</p>
        <Link
          href="/teacher"
          className="mt-6 inline-block rounded-xl border border-gold bg-amber px-5 py-3 font-bold text-on-amber"
        >
          กลับหน้าห้องเรียนทั้งหมด
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 lg:px-8">
      {/* ---------- header ---------- */}
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/teacher"
          aria-label="กลับหน้าห้องเรียนทั้งหมด"
          className="rounded-xl border border-border p-2 text-text2 transition hover:border-gold-dim hover:text-gold-hi"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {session.class_id ? (
          // คาบที่ผูกห้องถาวร — ชื่อมาจากห้อง (แก้ที่หน้าห้อง) กดแล้วดูประวัติห้องนี้
          <Link href={`/teacher/classes/${session.class_id}`} className="min-w-0 truncate text-2xl font-bold text-gold-hi hover:underline">
            {session.title ?? "ห้องเรียน"}
          </Link>
        ) : (
          <RoomTitle
            title={session.title}
            onSave={(t) => act(async () => {
              await renameClassroomSession(sessionId, t);
              await refetch();
            })}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
              connected ? "bg-good/10 text-good" : "bg-warn/10 text-warn"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-good" : "animate-pulse bg-warn"}`} />
            {connected ? "เชื่อมต่อสด" : "กำลังเชื่อมต่อ…"}
          </span>
          <button
            type="button"
            onClick={() => setProjector(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text2 transition hover:border-gold-dim hover:text-gold-hi"
          >
            <Maximize2 className="h-4 w-4" />
            <span className="hidden sm:inline">ขึ้นจอใหญ่</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="rounded-xl border border-border px-3 py-2 text-sm text-text3 transition hover:border-red hover:text-red"
          >
            ปิดห้อง
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm text-red">
          <span>{error}</span>
          <button type="button" aria-label="ปิดข้อความ" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ---------- code + roster ---------- */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="flex flex-col items-center justify-center rounded-3xl border border-gold-dim bg-card px-6 py-8 text-center">
          <p className="text-sm text-text2">1. เปิดเว็บ</p>
          <p className="mt-1 text-xl font-bold text-text">{joinHost}</p>
          <p className="mt-5 text-sm text-text2">2. กรอกรหัสห้อง</p>
          <p className="mt-1 whitespace-nowrap font-mono text-6xl font-bold tracking-[0.12em] text-gold-hi sm:text-7xl">
            {formatJoinCode(session.join_code)}
          </p>
          <button
            type="button"
            disabled={!joinLink}
            onClick={() => {
              void navigator.clipboard?.writeText(joinLink).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="mt-6 flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text2 transition hover:border-gold-dim hover:text-gold-hi"
          >
            {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์ส่งในกลุ่มไลน์"}
          </button>
        </section>

        <section className="flex min-h-[320px] flex-col rounded-3xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-text">
              นักเรียน <span className="text-gold-hi">{participants.length}</span> คน
            </h2>
            {presenceMeaningful && participants.length > 0 && (
              <span className="text-sm text-text3">· ออนไลน์ {onlineCount}</span>
            )}
            <div className="ml-auto flex rounded-xl border border-border p-0.5 text-xs">
              {(["number", "recent"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSortMode(m)}
                  className={`rounded-lg px-2.5 py-1 transition ${
                    sortMode === m ? "bg-track text-gold-hi" : "text-text3"
                  }`}
                >
                  {m === "number" ? "เรียงเลขที่" : "เข้าล่าสุด"}
                </button>
              ))}
            </div>
          </div>

          {participants.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber" />
              </span>
              <p className="mt-2 font-bold text-text">รอนักเรียนเข้าห้อง</p>
              <p className="max-w-xs text-sm text-text3">
                พอนักเรียนกรอกรหัส ชื่อและ Qmon ของแต่ละคนจะขึ้นตรงนี้ทันที
              </p>
            </div>
          ) : (
            <ul className="mt-3 grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
              {sorted.map((p) => {
                const name = rosterDisplayName(p);
                const pet = resolveRosterPet(p);
                const online = isOnline(p.user_id);
                const fresh = freshIds.has(p.user_id);
                const kicking = kickTarget === p.user_id;
                return (
                  <li
                    key={p.user_id}
                    className={`relative rounded-2xl border p-2.5 transition ${
                      fresh ? "animate-evolve-pop border-good bg-good/10" : "border-border bg-bg/40"
                    }`}
                  >
                    {kicking ? (
                      <div className="flex h-full flex-col justify-center gap-2 text-center">
                        <p className="text-sm text-text">นำ {name} ออก?</p>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setKickTarget(null)}
                            className="flex-1 rounded-lg border border-border py-1.5 text-xs text-text2"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              act(async () => {
                                await kickClassroomParticipant(sessionId, p.user_id);
                                setKickTarget(null);
                                await refetch();
                              })
                            }
                            className="flex-1 rounded-lg bg-red py-1.5 text-xs font-bold text-white disabled:opacity-50"
                          >
                            นำออก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <RosterAvatar pet={pet} name={name} size={52} dim={!online} />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${online ? "text-text" : "text-text3"}`}>
                            {p.student_number !== null && (
                              <span className="mr-1 text-gold-hi">{p.student_number}.</span>
                            )}
                            {name}
                          </p>
                          <p className="truncate text-xs text-text3">
                            {!online
                              ? "หลุดการเชื่อมต่อ"
                              : fresh
                                ? "เพิ่งเข้าห้อง"
                                : !p.display_name
                                  ? "ยังไม่กรอกชื่อจริง"
                                  : pet
                                    ? (pet.nickname ?? pet.speciesName)
                                    : "ยังไม่มี Qmon"}
                          </p>
                          {pet && p.pet_stage !== null && online && !fresh && p.display_name && (
                            <p className="truncate text-[11px] text-text3/80">{STAGE_LABEL[p.pet_stage]}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label={`นำ ${name} ออกจากห้อง`}
                          onClick={() => setKickTarget(p.user_id)}
                          className="absolute right-1.5 top-1.5 rounded-md p-1 text-text3/60 transition hover:bg-red/10 hover:text-red"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ---------- กิจกรรม ---------- */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text2">เลือกกิจกรรม</h2>
          {/* Boss Raid: ปิดผ่าน close_boss_raid (จบเกมถ้ายังเล่นอยู่ + กลับห้องรอ) — เดิม clear_classroom_activity
              ปฏิเสธตอน Raid ยังไม่จบ และหน้านี้ไม่มีปุ่มจบ Raid ครูจึงติด. ถามยืนยันก่อนเพราะอาจกำลังเล่นอยู่
              (ฝั่งนี้อ่านสถานะ Raid ไม่ได้) */}
          {session.current_activity === "boss_raid" && session.active_boss_raid_session_id ? (
            confirmCloseRaid ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text2">ถ้าเกมยังเล่นอยู่ จะจบทันที</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmCloseRaid(false)}
                  className="rounded-xl border border-border px-3 py-1.5 text-xs text-text2 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    act(async () => {
                      await closeBossRaid(session.active_boss_raid_session_id!);
                      setConfirmCloseRaid(false);
                      await refetch();
                    })
                  }
                  className="rounded-xl border border-red bg-red px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {pending ? "กำลังปิด…" : "ปิด Boss Raid"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmCloseRaid(true)}
                className="rounded-xl border border-gold-dim px-3 py-1.5 text-xs text-gold-hi transition active:scale-95 disabled:opacity-50"
              >
                ปิด Boss Raid · กลับห้องรอ
              </button>
            )
          ) : (
            session.current_activity !== null &&
            !focusRunning && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act(async () => {
                    const res = await clearClassroomActivity(sessionId);
                    if (!res.ok) throw new Error(res.error);
                    setPickedLog([]);
                    await refetch();
                  })
                }
                className="rounded-xl border border-gold-dim px-3 py-1.5 text-xs text-gold-hi transition active:scale-95 disabled:opacity-50"
              >
                จบกิจกรรม · กลับห้องรอ
              </button>
            )
          )}
        </div>

        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActivityCard
            icon={<Dices className="h-6 w-6" />}
            title="สุ่มรายชื่อ"
            desc="สุ่มคนตอบคำถาม โชว์ชื่อพร้อม Qmon บนจอ"
            active={session.current_activity === "name_picker"}
            disabled={pending || focusRunning}
            onClick={() =>
              act(async () => {
                await setClassroomActivityNamePicker(sessionId);
                await refetch();
              })
            }
          />
          <ActivityCard
            icon={<Swords className="h-6 w-6" />}
            title="Boss Raid"
            desc="ทั้งห้องช่วยกันตอบคำถามตีบอส"
            active={session.current_activity === "boss_raid"}
            disabled={pending || focusRunning || participants.length === 0}
            disabledHint={participants.length === 0 ? "รอนักเรียนเข้าห้องก่อน" : undefined}
            onClick={() =>
              act(async () => {
                // ลองเปิดใหม่ก่อนเสมอ — ถ้า Raid เดิมยังไม่จบ RPC จะปฏิเสธ (busy) แล้วพากลับหน้าควบคุมเดิมแทน
                // (ฝั่งครูอ่าน boss_raid_sessions.status ไม่ได้ จึงแยกเองไม่ได้ว่า Raid เดิมจบหรือยัง)
                // ไปหน้าควบคุม /boss-raid/[id] ไม่ใช่ /tv — เลือกบทเรียน + กดเริ่มเกมอยู่ที่นั่น (กดเริ่มแล้ว
                // LobbyClient พาไป /tv เอง). เดิม push /tv ตรง ครูไม่มีที่กดเริ่ม Raid ค้าง lobby ตลอด
                try {
                  const { bossRaidSessionId } = await launchBossRaidFromClassroom(sessionId);
                  router.push(`/boss-raid/${bossRaidSessionId}`);
                } catch (e) {
                  const raidId = session.active_boss_raid_session_id;
                  if (session.current_activity === "boss_raid" && raidId) {
                    router.push(`/boss-raid/${raidId}`);
                    return;
                  }
                  throw e;
                }
              })
            }
          />
          <ActivityCard
            icon={<Target className="h-6 w-6" />}
            title="คาบตั้งใจ"
            desc="วางมือถือ ตั้งใจเรียน ใครออกจากแอปรู้ทันที"
            active={focusRunning}
            disabled={pending || focusRunning}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await launchFocusMode(sessionId);
                if (!res.ok) {
                  setError(
                    res.code.includes("classroom_activity_busy") && focusSession?.status === "running"
                      ? "คาบตั้งใจกำลังดำเนินอยู่"
                      : res.error
                  );
                }
                await refetch();
              })
            }
          />
        </div>

        {focusRunning && focusSession && (
          <FocusTeacherPanel
            focusSessionId={focusSession.id}
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

        {/* สรุปท้ายคาบ — โชว์จนครูปิดหรือเริ่มกิจกรรมถัดไป (รีโหลดหน้าแล้วหาย: ประวัติดูที่หน้าห้องเรียน) */}
        {!focusRunning &&
          focusSession?.status === "ended" &&
          session.current_activity === null &&
          dismissedFocusId !== focusSession.id && (
            <FocusSummaryCard
              key={focusSession.id}
              focusSessionId={focusSession.id}
              onClose={() => setDismissedFocusId(focusSession.id)}
            />
          )}

        {session.current_activity === "name_picker" && (
          <div className="mt-4 rounded-3xl border border-gold-dim bg-card p-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
              <PickDisplay
                spinning={spinning}
                spinRow={spinName}
                latest={pickedLog[0]}
                latestRow={latestPick}
              />
              <div className="flex w-full flex-col gap-3 sm:w-56">
                <button
                  type="button"
                  disabled={spinning || participants.length === 0}
                  onClick={runPick}
                  className="w-full rounded-2xl border border-gold bg-amber px-4 py-4 text-lg font-bold text-on-amber transition active:scale-95 disabled:opacity-50"
                >
                  {spinning ? "กำลังสุ่ม…" : pickedLog.length > 0 ? "สุ่มคนต่อไป" : "กดสุ่ม"}
                </button>
                {participants.length === 0 && (
                  <p className="text-center text-xs text-text3">ยังไม่มีนักเรียนในห้อง</p>
                )}
                {presenceMeaningful && participants.length > onlineCount && (
                  <p className="text-center text-xs text-text3">สุ่มเฉพาะคนที่ออนไลน์อยู่</p>
                )}
              </div>
            </div>
            {pickedLog.length > 1 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs text-text3">สุ่มไปแล้ว</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pickedLog.slice(1).map((p, i) => (
                    <span
                      key={`${p.userId}-${p.pickedAt}-${i}`}
                      className="rounded-full bg-track px-3 py-1 text-xs text-text2"
                    >
                      {p.studentNumber !== null && `${p.studentNumber}. `}
                      {p.displayName || p.username || "นักเรียน"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- โหมดขึ้นจอใหญ่ ---------- */}
      {projector && (
        <div
          role="dialog"
          aria-label="รหัสห้องแบบเต็มจอ"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg px-6 text-center"
          onKeyDown={(e) => e.key === "Escape" && setProjector(false)}
        >
          <button
            type="button"
            autoFocus
            onClick={() => setProjector(false)}
            className="absolute right-5 top-5 flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text2"
          >
            <X className="h-4 w-4" /> ปิด
          </button>
          <p className="text-[3vw] text-text2">
            เปิด <span className="font-bold text-text">{joinHost}</span> แล้วกรอกรหัส
          </p>
          <p className="mt-[2vh] whitespace-nowrap font-mono text-[16vw] font-bold leading-none tracking-[0.1em] text-gold-hi">
            {formatJoinCode(session.join_code)}
          </p>
          <p className="mt-[4vh] text-[2.5vw] text-text2">
            เข้าแล้ว <span className="font-bold text-gold-hi">{participants.length}</span> คน
          </p>
          <div className="mt-[2vh] flex max-w-[90vw] flex-wrap justify-center gap-2">
            {participants.slice(0, 40).map((p) => (
              <div key={p.user_id} className={freshIds.has(p.user_id) ? "animate-evolve-pop" : ""}>
                <RosterAvatar pet={resolveRosterPet(p)} name={rosterDisplayName(p)} size={56} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- ยืนยันปิดห้อง ---------- */}
      {confirmEnd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-lg font-bold text-text">ปิดห้องเรียนนี้?</p>
            <p className="mt-2 text-sm text-text3">
              นักเรียนทั้ง {participants.length} คนจะออกจากห้อง และใช้รหัสนี้เข้าไม่ได้อีก
              {session.current_activity === "boss_raid" && " — Boss Raid ที่ยังเล่นอยู่จะจบไปด้วย"}
              {focusRunning && " — คาบตั้งใจที่กำลังดำเนินอยู่จะจบไปด้วย"}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="flex-1 rounded-xl border border-border py-3 text-sm text-text2"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act(async () => {
                    await endClassroomSession(sessionId);
                    router.push("/teacher");
                  })
                }
                className="flex-1 rounded-xl bg-red py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? "กำลังปิด…" : "ปิดห้อง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function RoomTitle({ title, onSave }: { title: string | null; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title ?? "");

  if (editing) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          if (value.trim() !== (title ?? "")) onSave(value);
        }}
      >
        <input
          autoFocus
          value={value}
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          placeholder="เช่น ม.2/3 วิทยาศาสตร์"
          className="min-w-0 flex-1 rounded-xl border border-gold-dim bg-track px-3 py-1.5 text-lg font-bold text-gold-hi placeholder:text-text3"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(title ?? "");
        setEditing(true);
      }}
      className="group flex min-w-0 items-center gap-2 text-left"
    >
      <h1 className={`truncate text-2xl font-bold ${title ? "text-gold-hi" : "text-text3"}`}>
        {title ?? "ตั้งชื่อห้อง"}
      </h1>
      <Pencil className="h-4 w-4 shrink-0 text-text3 transition group-hover:text-gold-hi" />
    </button>
  );
}

function ActivityCard({
  icon,
  title,
  desc,
  active,
  disabled,
  disabledHint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  active: boolean;
  disabled: boolean;
  disabledHint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled && !active}
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border-amber bg-amber/10"
          : "border-border bg-card hover:border-gold-dim"
      }`}
    >
      <span
        className={`rounded-xl p-2 ${active ? "bg-amber text-on-amber" : "bg-track text-gold-hi"}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-bold text-text">
          {title}
          {active && (
            <span className="rounded-full bg-amber px-2 py-0.5 text-[10px] font-bold text-on-amber">
              กำลังเล่น
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-text3">
          {disabled && !active && disabledHint ? disabledHint : desc}
        </span>
      </span>
    </button>
  );
}

function PickDisplay({
  spinning,
  spinRow,
  latest,
  latestRow,
}: {
  spinning: boolean;
  spinRow: ClassroomParticipant | null;
  latest: PickedStudent | undefined;
  latestRow: ClassroomParticipant | undefined;
}) {
  if (spinning && spinRow) {
    return (
      <div className="flex flex-1 items-center gap-5">
        <RosterAvatar pet={resolveRosterPet(spinRow)} name={rosterDisplayName(spinRow)} size={120} />
        <p className="truncate text-3xl font-bold text-text3">{rosterDisplayName(spinRow)}</p>
      </div>
    );
  }
  if (!latest) {
    return (
      <div className="flex flex-1 items-center gap-5">
        <div className="flex h-[120px] w-[120px] items-center justify-center rounded-2xl bg-track text-5xl font-bold text-text3">
          ?
        </div>
        <p className="text-lg text-text3">กดสุ่มเพื่อเลือกคนตอบ</p>
      </div>
    );
  }
  const name = latest.displayName || latest.username || "นักเรียน";
  const pet = latestRow ? resolveRosterPet(latestRow) : null;
  return (
    <div key={`${latest.userId}-${name}`} className="flex flex-1 animate-evolve-pop items-center gap-5">
      <RosterAvatar pet={pet} name={name} size={140} />
      <div className="min-w-0">
        {latest.studentNumber !== null && (
          <p className="text-lg text-gold">เลขที่ {latest.studentNumber}</p>
        )}
        <p className="truncate text-4xl font-bold text-gold-hi">{name}</p>
        {pet && <p className="mt-1 truncate text-sm text-text3">คู่หู: {pet.nickname ?? pet.speciesName}</p>}
      </div>
    </div>
  );
}
