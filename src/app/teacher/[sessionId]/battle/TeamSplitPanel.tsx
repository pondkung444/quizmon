"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import RosterAvatar from "@/components/classroom/RosterAvatar";
import {
  STAGE_LABEL,
  resolveRosterPet,
  rosterDisplayName,
  type ClassroomRosterRow,
} from "@/lib/classroom/roster";
import { explainBattleError, explainCheck } from "@/lib/teamBattle/errors";
import { teacherRpc } from "@/lib/teamBattle/rpc";
import { averageStat, otherTeam, splitMembers } from "@/lib/teamBattle/scope";
import type { SetupMember, SetupView, TeamId } from "@/lib/teamBattle/types";

const RELOAD_DEBOUNCE_MS = 400;
// sync เองเป็นระยะเพื่อรับคนที่เข้าห้องระหว่างแบ่งทีม — ห้าม sync เมื่อ membersVersion เปลี่ยน
// (tb_sync_roster อัปเดตแถวสมาชิกทุกครั้ง จะยิง realtime เข้าตัวเองวนไม่รู้จบ)
const AUTO_SYNC_MS = 20_000;

const TEAM_STYLE: Record<TeamId, { label: string; head: string; ring: string }> = {
  a: { label: "ทีม A", head: "text-indigo-hi", ring: "border-indigo/40" },
  b: { label: "ทีม B", head: "text-amber", ring: "border-amber/40" },
};

type Confirm = "resplit" | "cancel" | null;

export default function TeamSplitPanel({
  sessionId,
  battleId,
  membersVersion,
  onStarted,
  onCancelled,
}: {
  sessionId: string;
  battleId: string;
  membersVersion: number;
  onStarted: () => void;
  onCancelled: () => void;
}) {
  const [setup, setSetup] = useState<SetupView | null>(null);
  const [roster, setRoster] = useState<Map<string, ClassroomRosterRow>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        teacherRpc.getSetup(battleId),
        createClient().rpc("get_classroom_roster", { p_session_id: sessionId }),
      ]);
      if (!aliveRef.current) return;
      setSetup(s);
      const map = new Map<string, ClassroomRosterRow>();
      for (const row of (r.data as ClassroomRosterRow[] | null) ?? []) map.set(row.user_id, row);
      setRoster(map);
    } catch (e) {
      if (aliveRef.current) setError(explainBattleError(e).message);
    }
  }, [battleId, sessionId]);

  const syncAndLoad = useCallback(async () => {
    try {
      await teacherRpc.syncRoster(battleId);
    } catch {
      /* เกมอาจเริ่มไปแล้ว — load ด้านล่างจะสะท้อนสถานะจริง */
    }
    await load();
  }, [battleId, load]);

  // เปิดหน้า: sync + โหลด; แล้ว sync เป็นระยะ (เฉพาะแท็บที่มองเห็น)
  useEffect(() => {
    aliveRef.current = true;
    const first = setTimeout(() => void syncAndLoad(), 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void syncAndLoad();
    }, AUTO_SYNC_MS);
    return () => {
      aliveRef.current = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [syncAndLoad]);

  // สมาชิกเปลี่ยน (realtime) → โหลดใหม่แบบ debounce (ไม่ sync)
  useEffect(() => {
    if (membersVersion === 0) return;
    const t = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [membersVersion, load]);

  async function run(fn: () => Promise<void>, manual = false) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (manual) setTouched(true);
      await load();
    } catch (e) {
      setError(explainBattleError(e).message);
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  function onSwapClick(m: SetupMember) {
    if (swapFrom === null || swapFrom === m.user_id) {
      setSwapFrom(swapFrom === m.user_id ? null : m.user_id);
      return;
    }
    const from = setup?.members.find((x) => x.user_id === swapFrom);
    if (!from || from.team === m.team) {
      setSwapFrom(m.user_id);
      return;
    }
    setSwapFrom(null);
    void run(() => teacherRpc.swapPlayers(battleId, from.user_id, m.user_id), true);
  }

  if (!setup) return <p className="mt-6 text-center text-sm text-text3">กำลังโหลดรายชื่อทีม…</p>;

  const { a, b, spectators } = splitMembers(setup.members);
  const checks = setup.checks;
  const swapMember = swapFrom ? setup.members.find((m) => m.user_id === swapFrom) : null;

  return (
    <div className="mt-5 space-y-4">
      {/* ---- สรุป + เตือน ---- */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-gold-hi">แบ่งทีม</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => teacherRpc.syncRoster(battleId))}
              className="rounded-xl border border-border px-3 py-1.5 text-sm text-text2 hover:border-gold-dim disabled:opacity-50"
            >
              ซิงก์รายชื่อ
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => (touched ? setConfirm("resplit") : void run(() => teacherRpc.autoSplit(battleId)))}
              className="rounded-xl border border-border px-3 py-1.5 text-sm text-text2 hover:border-gold-dim disabled:opacity-50"
            >
              แบ่งทีมใหม่
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-text3">
          แบ่งให้สมดุลอัตโนมัติตามพลัง Qmon ย้าย/สลับเองได้ · จำนวนโจทย์ในขอบเขตนี้ {checks.question_count} ข้อ
        </p>

        {checks.block.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg bg-red/10 px-3 py-2 text-sm text-red" data-testid="checks-block">
            {checks.block.map((c) => (
              <li key={c}>{explainCheck(c)}</li>
            ))}
          </ul>
        )}
        {checks.warn.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn" data-testid="checks-warn">
            {checks.warn.map((c) => (
              <li key={c}>{explainCheck(c)}</li>
            ))}
          </ul>
        )}
        {swapMember && (
          <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-sm text-gold-hi">
            กำลังสลับ: {rosterDisplayName(swapMember)} — กด &quot;สลับ&quot; ที่นักเรียนอีกทีมที่ต้องการสลับด้วย
            <button type="button" className="ml-2 underline" onClick={() => setSwapFrom(null)}>
              ยกเลิก
            </button>
          </p>
        )}
        {error && <p className="mt-3 rounded-lg bg-red/10 px-3 py-2 text-sm text-red">{error}</p>}
      </section>

      {/* ---- 2 ทีม ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        {(["a", "b"] as TeamId[]).map((t) => (
          <TeamColumn
            key={t}
            team={t}
            members={t === "a" ? a : b}
            stat={averageStat(setup.members, t)}
            roster={roster}
            busy={busy}
            swapFrom={swapFrom}
            swapTeam={swapMember?.team ?? null}
            onMove={(m) => void run(() => teacherRpc.movePlayer(battleId, m.user_id, otherTeam(m.team)), true)}
            onSwap={onSwapClick}
            onToggle={(m) => void run(() => teacherRpc.setPlayer(battleId, m.user_id, false), true)}
          />
        ))}
      </div>

      {spectators.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-bold text-text">ผู้ชม ({spectators.length})</h3>
          <p className="text-xs text-text3">นั่งดูอย่างเดียว ไม่นับในทีม</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {spectators.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 rounded-xl border border-border bg-track p-2">
                <RosterAvatar pet={petOf(roster, m)} name={rosterDisplayName(m)} size={40} />
                <span className="min-w-0 flex-1 truncate text-sm text-text">{rosterDisplayName(m)}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => teacherRpc.setPlayer(battleId, m.user_id, true), true)}
                  className="rounded-lg border border-gold-dim px-2.5 py-1 text-xs text-gold-hi disabled:opacity-50"
                >
                  กลับมาเป็นผู้เล่น
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- เริ่ม/ยกเลิก ---- */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy || !checks.can_start}
          onClick={() =>
            void run(async () => {
              await teacherRpc.start(battleId);
              onStarted();
            })
          }
          className="min-w-48 flex-1 rounded-2xl border border-gold bg-amber py-3.5 text-lg font-bold text-on-amber transition active:scale-95 disabled:opacity-40"
        >
          เริ่มเกม
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirm("cancel")}
          className="rounded-2xl border border-border px-5 py-3.5 text-text2 hover:border-red hover:text-red disabled:opacity-50"
        >
          ยกเลิกเกมนี้
        </button>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
            <p className="text-lg font-bold text-text">
              {confirm === "resplit" ? "แบ่งทีมใหม่ทั้งหมด?" : "ยกเลิกเกมนี้?"}
            </p>
            <p className="mt-2 text-sm text-text3">
              {confirm === "resplit"
                ? "ที่ย้าย/สลับเองไว้จะถูกจัดใหม่ตามพลัง Qmon (ผู้ที่ตัดเป็นผู้ชมยังคงเป็นผู้ชม)"
                : "กลับไปเลือกขอบเขตโจทย์ใหม่ได้ ห้องเรียนกลับสู่ห้องรอ"}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-xl border border-border py-3 text-sm text-text2"
              >
                ไม่ใช่ตอนนี้
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const which = confirm;
                  setConfirm(null);
                  if (which === "resplit") {
                    setTouched(false);
                    void run(() => teacherRpc.autoSplit(battleId));
                  } else {
                    void run(async () => {
                      await teacherRpc.cancelSetup(battleId);
                      onCancelled();
                    });
                  }
                }}
                className="flex-1 rounded-xl bg-amber py-3 text-sm font-bold text-on-amber disabled:opacity-50"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function petOf(roster: Map<string, ClassroomRosterRow>, m: SetupMember) {
  const row = roster.get(m.user_id);
  return row ? resolveRosterPet(row) : null;
}

function TeamColumn({
  team,
  members,
  stat,
  roster,
  busy,
  swapFrom,
  swapTeam,
  onMove,
  onSwap,
  onToggle,
}: {
  team: TeamId;
  members: SetupMember[];
  stat: ReturnType<typeof averageStat>;
  roster: Map<string, ClassroomRosterRow>;
  busy: boolean;
  swapFrom: string | null;
  swapTeam: TeamId | null;
  onMove: (m: SetupMember) => void;
  onSwap: (m: SetupMember) => void;
  onToggle: (m: SetupMember) => void;
}) {
  const style = TEAM_STYLE[team];
  return (
    <section className={`rounded-2xl border bg-card p-4 ${style.ring}`} data-testid={`team-${team}`}>
      <div className="flex items-baseline justify-between">
        <h3 className={`text-lg font-bold ${style.head}`}>{style.label}</h3>
        <span className="text-sm text-text2">{members.length} คน</span>
      </div>
      {stat ? (
        <p className="mt-1 text-xs text-text3">
          เฉลี่ยโดยประมาณ · HP {stat.hp} · ATK {stat.atk} · DEF {stat.def} · SPD {stat.spd} · FOC {stat.foc}
        </p>
      ) : (
        <p className="mt-1 text-xs text-text3">ยังไม่มีผู้เล่นในทีมนี้</p>
      )}
      <ul className="mt-3 space-y-2">
        {members.map((m) => {
          const selected = swapFrom === m.user_id;
          const canPairWith = swapFrom !== null && !selected && swapTeam !== null && swapTeam !== m.team;
          const stage = m.pet_stage ? STAGE_LABEL[m.pet_stage] : null;
          return (
            <li
              key={m.user_id}
              className={`rounded-xl border p-2 ${selected ? "border-gold bg-amber/10" : "border-border bg-track"}`}
            >
              <div className="flex items-center gap-3">
                <RosterAvatar pet={petOf(roster, m)} name={rosterDisplayName(m)} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-text">
                    {m.student_number !== null && `${m.student_number}. `}
                    {rosterDisplayName(m)}
                  </p>
                  <p className="truncate text-xs text-text3">
                    {stage ?? "ยังไม่มีคู่หู"} · พลัง {Math.round(m.power)}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMove(m)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-text2 hover:border-gold-dim disabled:opacity-50"
                >
                  ย้ายไปทีม {otherTeam(team).toUpperCase()}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSwap(m)}
                  className={`rounded-lg border px-2.5 py-1 text-xs disabled:opacity-50 ${
                    selected || canPairWith
                      ? "border-gold bg-amber text-on-amber"
                      : "border-border text-text2 hover:border-gold-dim"
                  }`}
                >
                  {selected ? "เลือกอยู่" : canPairWith ? "สลับกับคนนี้" : "สลับ"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggle(m)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-text3 hover:border-gold-dim disabled:opacity-50"
                >
                  ให้เป็นผู้ชม
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
