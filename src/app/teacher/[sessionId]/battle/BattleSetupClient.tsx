"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { explainBattleError } from "@/lib/teamBattle/errors";
import { teacherRpc } from "@/lib/teamBattle/rpc";
import { toCentralView } from "@/lib/teamBattle/types";
import { useTeamBattleState } from "@/lib/teamBattle/useTeamBattleState";
import { useTeamBattleTicker } from "@/lib/teamBattle/useTeamBattleTicker";
import BattleCentral from "./BattleCentral";
import CreatePanel from "./CreatePanel";
import TeamSplitPanel from "./TeamSplitPanel";

// Team Battle — หน้าครู: สร้างเกม → แบ่งทีม → แผงสถานะ → จบ  (เข้าด้วย URL ตรง; ทางเข้าอยู่ PR 4.5)
export default function BattleSetupClient({
  sessionId,
  title,
  initialBattleId,
}: {
  sessionId: string;
  title: string;
  initialBattleId: string | null;
}) {
  const [battleId, setBattleId] = useState<string | null>(initialBattleId);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-5 lg:px-8">
      <header className="flex items-center gap-3">
        <Link
          href={`/teacher/${sessionId}`}
          aria-label="กลับห้องเรียน"
          className="rounded-xl border border-border p-2 text-text2 transition hover:border-gold-dim hover:text-gold-hi"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs text-text3">{title}</p>
          <h1 className="truncate text-2xl font-bold text-gold-hi">Team Battle</h1>
        </div>
      </header>

      {battleId ? (
        <BattleRoom key={battleId} sessionId={sessionId} battleId={battleId} onReset={() => setBattleId(null)} />
      ) : (
        <CreatePanel sessionId={sessionId} onCreated={setBattleId} />
      )}
    </main>
  );
}

function BattleRoom({
  sessionId,
  battleId,
  onReset,
}: {
  sessionId: string;
  battleId: string;
  onReset: () => void;
}) {
  const { state, loading, error, refetch, clock, membersVersion } = useTeamBattleState(battleId, { mode: "host" });
  const [ending, setEnding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // จอครูเป็นตัวเคาะหลัก: ปิดยกที่หมดเวลา (เลือกการ์ดแทน/คิดผล) — ถ้าไม่เคาะ ยกจะค้างเมื่อไม่มีใครตอบ
  useTeamBattleTicker({
    battleId,
    mode: "host",
    status: state?.battle.status,
    phase: state?.battle.phase,
    currentRound: state?.battle.current_round,
    roundDeadline: state?.battle.round_deadline,
    clock,
    refetch,
  });

  if (!state) {
    return loading ? (
      <p className="mt-6 text-center text-sm text-text3">กำลังโหลดเกม…</p>
    ) : (
      <div className="mt-6 text-center">
        <p className="text-sm text-text2">{error?.message ?? "โหลดเกมไม่สำเร็จ"}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-xl border border-border px-4 py-2 text-sm text-text2"
        >
          ลองอีกครั้ง
        </button>
        <button type="button" onClick={onReset} className="ml-2 text-sm text-gold-hi underline">
          กลับไปตั้งค่าเกมใหม่
        </button>
      </div>
    );
  }

  const status = state.battle.status;

  if (status === "setup") {
    return (
      <TeamSplitPanel
        sessionId={sessionId}
        battleId={battleId}
        membersVersion={membersVersion}
        onStarted={() => void refetch()}
        onCancelled={onReset}
      />
    );
  }

  // active + finished/abandoned → จอกลางเต็มจอ (รับ CentralBattleView ที่ตัด user_id ออกแล้ว)
  return (
    <BattleCentral
      view={toCentralView(state)}
      clock={clock}
      ending={ending}
      error={actionError}
      backHref={`/teacher/${sessionId}`}
      onNew={onReset}
      onEnd={async () => {
        setEnding(true);
        setActionError(null);
        try {
          await teacherRpc.endBattle(battleId);
          await refetch();
        } catch (e) {
          setActionError(explainBattleError(e).message);
        } finally {
          setEnding(false);
        }
      }}
    />
  );
}
