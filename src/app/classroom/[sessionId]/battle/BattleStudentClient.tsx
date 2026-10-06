"use client";

import { useCallback, useEffect, useState } from "react";
import { TEAM_NAME, hpPercent } from "@/lib/teamBattle/central";
import { fetchMyAnswer, fetchMyMember } from "@/lib/teamBattle/rpc";
import {
  OVERLAY_INITIAL,
  STUDENT_TEXT,
  answerFeedback,
  answeredPollDelay,
  chooseScreen,
  deriveRole,
  overlayVisible,
  reduceOverlay,
  type StudentScreen,
} from "@/lib/teamBattle/student";
import { toCentralView, type BattleSnapshot, type MyAnswer, type MyMember, type TeamId } from "@/lib/teamBattle/types";
import { useNowTick } from "@/lib/teamBattle/useNowTick";
import { useTeamBattleState } from "@/lib/teamBattle/useTeamBattleState";
import { useTeamBattleTicker } from "@/lib/teamBattle/useTeamBattleTicker";
import AnswerPanel from "./AnswerPanel";
import BattleEnd from "./BattleEnd";
import CommanderPick from "./CommanderPick";
import RoundResultOverlay from "./RoundResultOverlay";
import SpectatorView from "./SpectatorView";
import WaitView from "./WaitView";
import styles from "./battle.module.css";

// Team Battle — หน้านักเรียน (มือถือ): ตัดสินหน้าจอจาก role + สถานะเกม (ตารางใน student.ts chooseScreen)
// ชื่อโชว์เฉพาะมือถือตัวเอง — ไม่มีชื่อใครผูกกับคำตอบ; ข้อมูลรวมทั้งหมดผ่าน get_team_battle_state

const TEAM_TEXT: Record<TeamId, string> = { a: "text-indigo-hi", b: "text-amber" };
const TEAM_BAR: Record<TeamId, string> = { a: "bg-indigo", b: "bg-amber" };

export default function BattleStudentClient({
  sessionId,
  userId,
  battleId,
}: {
  sessionId: string;
  userId: string;
  battleId: string;
}) {
  const { state, loading, error, refetch, clock, membersVersion } = useTeamBattleState(battleId, {
    mode: "student",
  });
  const now = useNowTick();
  const status = state?.battle.status;

  // แถวสมาชิกของฉัน (null = ไม่มีแถว = ผู้ชม) — โหลดใหม่เมื่อสมาชิกเปลี่ยน/เกมเปลี่ยนสถานะ
  const [member, setMember] = useState<MyMember | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchMyMember(battleId)
      .then((m) => {
        if (cancelled) return;
        setMember(m);
        setMemberLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setMemberLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [battleId, membersVersion, status]);

  // ตอบแล้วในยกไหน (ส่งสำเร็จ / already_answered / พบคำตอบเดิม)
  const [answeredRound, setAnsweredRound] = useState<number | null>(null);
  const handleAnswered = useCallback((r: number) => setAnsweredRound(r), []);

  // จอนักเรียนเป็นตัวเคาะสำรอง (jitter 1–3 วิหลัง deadline)
  useTeamBattleTicker({
    battleId,
    mode: "student",
    status,
    phase: state?.battle.phase,
    currentRound: state?.battle.current_round,
    roundDeadline: state?.battle.round_deadline,
    clock,
    refetch,
  });

  // overlay ผลยก: ตั้ง baseline ตอนโหลดครั้งแรก (ไม่โชว์) แล้วโชว์เมื่อ round_no เปลี่ยน (ปรับ state ระหว่าง render)
  const [overlay, setOverlay] = useState(OVERLAY_INITIAL);
  const lastNo = state ? (state.last_round?.round_no ?? null) : undefined;
  if (lastNo !== undefined) {
    const next = reduceOverlay(overlay, lastNo, now);
    if (next !== overlay) setOverlay(next);
  }

  // คำตอบของฉันในยกที่เพิ่งปิด (เติม "ข้อนี้คุณตอบถูก"/"ยังไม่ถูก" เฉพาะมือถือตัวเอง)
  const isPlayer = !!member?.is_player;
  const [mine, setMine] = useState<{ round: number; answer: MyAnswer | null } | null>(null);
  useEffect(() => {
    if (!lastNo || !isPlayer) return;
    let cancelled = false;
    void fetchMyAnswer(battleId, lastNo)
      .then((a) => {
        if (!cancelled) setMine({ round: lastNo, answer: a });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [battleId, lastNo, isPlayer]);

  if (!state) {
    return (
      <Shell>
        {loading ? (
          <p className="py-16 text-center text-text3">{STUDENT_TEXT.loading}</p>
        ) : (
          <div className="py-16 text-center">
            <p className="text-text2">{error?.message ?? STUDENT_TEXT.loadFailed}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 min-h-12 rounded-xl border border-gold-dim px-5 text-gold-hi active:scale-95"
            >
              {STUDENT_TEXT.retry}
            </button>
          </div>
        )}
      </Shell>
    );
  }

  const b = state.battle;
  const view = toCentralView(state);
  const backHref = `/classroom/${sessionId}`;
  const role = deriveRole({
    myId: userId,
    member,
    attackerTeam: b.attacker_team,
    commanderUserId: state.round.commander_user_id,
  });
  const screen: StudentScreen =
    !memberLoaded && b.status === "active"
      ? "preparing"
      : chooseScreen({
          status: b.status,
          phase: b.phase,
          role,
          answeredThisRound: answeredRound === b.current_round,
        });

  return (
    <Shell>
      {b.status === "active" && <StatusBar battle={b} myTeam={role.team} />}

      <Screen
        screen={screen}
        battleId={battleId}
        state={state}
        view={view}
        member={member}
        backHref={backHref}
        clockMs={clock.msUntil(b.round_deadline, now)}
        refetch={refetch}
        clock={clock}
        onAnswered={handleAnswered}
      />

      {b.status === "active" && state.last_round && overlayVisible(overlay, now) && (
        <RoundResultOverlay
          round={state.last_round}
          feedback={
            role.isPlayer && mine?.round === state.last_round.round_no ? answerFeedback(mine.answer) : null
          }
          onClose={() => setOverlay({ ...overlay, shownAt: null })}
        />
      )}
      <Poller screen={screen} phase={b.phase} status={b.status} refetch={refetch} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-md space-y-3 px-4 pb-28 pt-4">{children}</main>;
}

/** แถบสถานะ: ทีมของฉัน + HP สองทีม + ยกที่ (ตัวเลขรวมเท่านั้น) */
function StatusBar({ battle: b, myTeam }: { battle: BattleSnapshot; myTeam: TeamId | null }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3" data-testid="status-bar">
      <div className="flex items-center justify-between text-xs text-text3">
        <span>
          {myTeam ? (
            <span className={`font-bold ${TEAM_TEXT[myTeam]}`}>{STUDENT_TEXT.youAreOnTeam(myTeam)}</span>
          ) : (
            "ผู้ชม"
          )}
        </span>
        <span>ยกที่ {b.current_round}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {(["a", "b"] as TeamId[]).map((t) => {
          const hp = (t === "a" ? b.hp_a : b.hp_b) ?? 0;
          const max = (t === "a" ? b.hp_max_a : b.hp_max_b) ?? 1;
          return (
            <div key={t}>
              <div className="flex items-baseline justify-between">
                <span className={`text-xs font-bold ${TEAM_TEXT[t]}`}>{TEAM_NAME[t]}</span>
                <span className="text-xs tabular-nums text-text2">{hp}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-track">
                <div className={`h-full ${TEAM_BAR[t]} ${styles.bar}`} style={{ width: `${hpPercent(hp, max)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Screen({
  screen,
  battleId,
  state,
  view,
  member,
  backHref,
  clockMs,
  refetch,
  clock,
  onAnswered,
}: {
  screen: StudentScreen;
  battleId: string;
  state: NonNullable<ReturnType<typeof useTeamBattleState>["state"]>;
  view: ReturnType<typeof toCentralView>;
  member: MyMember | null;
  backHref: string;
  clockMs: number;
  refetch: () => Promise<void>;
  clock: ReturnType<typeof useTeamBattleState>["clock"];
  onAnswered: (round: number) => void;
}) {
  const b = state.battle;
  switch (screen) {
    case "waiting_setup":
      return (
        <WaitView
          title={STUDENT_TEXT.waitingSetup}
          subtitle={member ? STUDENT_TEXT.youAreOnTeam(member.team) : undefined}
        />
      );
    case "spectator":
      return <SpectatorView view={view} />;
    case "commander_pick":
      return (
        <CommanderPick
          key={`${battleId}:${b.current_round}`}
          battleId={battleId}
          round={b.current_round}
          deadline={b.round_deadline}
          config={b.config}
          clock={clock}
          refetch={refetch}
        />
      );
    case "wait_pick_attacker":
      return <WaitView title={STUDENT_TEXT.waitPickAttacker} msLeft={clockMs} />;
    case "wait_pick_defender":
      return <WaitView title={STUDENT_TEXT.waitPickDefender} msLeft={clockMs} />;
    case "answer":
      return (
        <AnswerPanel
          key={`${battleId}:${b.current_round}`}
          battleId={battleId}
          round={b.current_round}
          config={b.config}
          clock={clock}
          refetch={refetch}
          onAnswered={onAnswered}
        />
      );
    case "answered_wait":
      return (
        <WaitView
          title={STUDENT_TEXT.answeredWait}
          msLeft={clockMs}
          answered={state.round.answered}
          total={state.round.defenders_total ?? 0}
        />
      );
    case "attacker_watch":
      return (
        <WaitView
          title={STUDENT_TEXT.attackerWatch}
          msLeft={clockMs}
          card={state.round.card}
          answered={state.round.answered}
          total={state.round.defenders_total ?? 0}
        />
      );
    case "ended":
      return <BattleEnd view={view} backHref={backHref} />;
    case "preparing":
    default:
      return <WaitView title={STUDENT_TEXT.preparing} />;
  }
}

/**
 * poll ตัวนับ answered ~4 วิ ± 1 วิ — เฉพาะตอน phase=answering ที่หน้าจอไม่ได้กำลังตอบเอง และแท็บมองเห็น
 * (โหมด student ไม่ refetch ตามทุกคำตอบจาก realtime เพื่อกัน RPC พุ่งทั้งห้อง)
 */
function Poller({
  screen,
  phase,
  status,
  refetch,
}: {
  screen: StudentScreen;
  phase: string | null;
  status: string;
  refetch: () => Promise<void>;
}) {
  const polling =
    status === "active" &&
    phase === "answering" &&
    (screen === "answered_wait" || screen === "attacker_watch" || screen === "spectator");
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        if (document.visibilityState === "visible") void refetch();
        loop();
      }, answeredPollDelay(Math.random()));
    };
    loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [polling, refetch]);
  return null;
}
