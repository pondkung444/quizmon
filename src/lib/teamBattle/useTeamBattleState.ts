"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { usePvpResync } from "@/lib/pvp/usePvpResync";
import { explainBattleError, type ExplainedError } from "./errors";
import { viewerRpc } from "./rpc";
import type { BattleSnapshot, BattleState } from "./types";
import { useServerClock, type ClockEstimator } from "./useServerClock";

// Team Battle — โหลด get_team_battle_state + realtime (pattern เดียวกับ useClassroomLobby:
// setAuth ก่อน subscribe → refetch ทุกครั้งที่ SUBSCRIBED → cancelled guard)
//
// realtime เป็นแค่ "นาฬิกาปลุก" — ข้อมูลจริงมาจาก RPC เสมอ (pvp_team_answers เป็น own-row และไม่อยู่ใน publication
// จอกลางจึงรู้ตัวนับ answered ได้จาก state RPC เท่านั้น):
//   - แถว pvp_team_battles เปลี่ยน status/phase/current_round → refetch ทันที
//   - แถวเดียวกันเปลี่ยนอย่างอื่น (last_action_at ทุกคำตอบที่ยังไม่ครบ) → โหมด host debounce 300 ms
//     (เพื่อรีเฟรชตัวนับ answered); โหมด student ไม่ refetch (กัน N×N RPC ทั้งห้อง)
//   - pvp_team_members เปลี่ยน → membersVersion เพิ่ม ให้ผู้ใช้ตัดสินใจ refetch ของตัวเอง (my member / setup)
// resync: usePvpResync (focus/online/visibilitychange + 30 วิ) — อ่านอย่างเดียว ไม่ส่งคำตอบ

export type StateMode = "host" | "student";

export const ANSWERED_DEBOUNCE_MS = 300;

type State = {
  state: BattleState | null;
  loading: boolean;
  error: ExplainedError | null;
  refetch: () => Promise<void>;
  clock: ClockEstimator;
  /** เพิ่มทุกครั้งที่ pvp_team_members ของเกมนี้เปลี่ยน */
  membersVersion: number;
};

function keyOf(b: Pick<BattleSnapshot, "status" | "phase" | "current_round">): string {
  return `${b.status}|${b.phase}|${b.current_round}`;
}

export function useTeamBattleState(battleId: string, opts: { mode: StateMode }): State {
  const { mode } = opts;
  const clock = useServerClock();
  const [state, setState] = useState<BattleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ExplainedError | null>(null);
  const [membersVersion, setMembersVersion] = useState(0);

  const aliveRef = useRef(false);
  const keyRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const dirtyRef = useRef(false);

  // รวมคำขอที่ซ้อนกัน: ถ้ากำลังโหลดอยู่ ให้ทำเครื่องหมายแล้วโหลดซ้ำหลังจบ (กันผลเก่าทับผลใหม่)
  const refetch = useCallback(async () => {
    if (runningRef.current) {
      dirtyRef.current = true;
      return;
    }
    runningRef.current = true;
    try {
      do {
        dirtyRef.current = false;
        const t0 = Date.now();
        try {
          const s = await viewerRpc.getState(battleId);
          const t1 = Date.now();
          if (!aliveRef.current) return;
          clock.recordSample({ t0, t1, serverNow: s.server_now });
          keyRef.current = keyOf(s.battle);
          setState(s);
          setError(null);
        } catch (e) {
          if (!aliveRef.current) return;
          setError(explainBattleError(e));
        }
      } while (dirtyRef.current && aliveRef.current);
    } finally {
      runningRef.current = false;
      if (aliveRef.current) setLoading(false);
    }
  }, [battleId, clock]);

  useEffect(() => {
    aliveRef.current = true;
    keyRef.current = null;
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void refetch();

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(session?.access_token ?? null);
      } catch {
        /* setAuth ล้มเหลว — subscribe callback รายงาน CHANNEL_ERROR เอง */
      }
      if (cancelled) return;

      channel = supabase
        .channel(`team_battle:${battleId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "pvp_team_battles", filter: `id=eq.${battleId}` },
          (payload) => {
            if (cancelled) return;
            const n = payload.new as Partial<BattleSnapshot>;
            if (keyOf({ status: n.status!, phase: n.phase ?? null, current_round: n.current_round! }) !== keyRef.current) {
              void refetch();
            } else if (mode === "host") {
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => {
                timer = null;
                if (!cancelled) void refetch();
              }, ANSWERED_DEBOUNCE_MS);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pvp_team_members", filter: `battle_id=eq.${battleId}` },
          () => {
            if (!cancelled) setMembersVersion((v) => v + 1);
          }
        )
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status !== "SUBSCRIBED") {
            console.info(`[team battle ${battleId.slice(0, 8)}] channel status:`, status, err ?? "");
            return;
          }
          void refetch();
        });
    })();

    return () => {
      cancelled = true;
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [battleId, mode, refetch]);

  const resync = useCallback(() => {
    void refetch();
  }, [refetch]);
  usePvpResync(resync);

  return { state, loading, error, refetch, clock, membersVersion };
}
