"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { BattleStatus } from "./types";

// สถานะของ battle ที่ห้องชี้อยู่ (active_team_battle_id) — เบากว่า useTeamBattleState: อ่านแค่ status
// classroom_sessions ไม่ถูกอัปเดตตอนเกมจบ จึงต้องฟัง pvp_team_battles แถวเดียวเอง (pattern เดียวกับ hook อื่น:
// setAuth → subscribe → refetch ทุกครั้งที่ SUBSCRIBED)
// loaded = รู้สถานะของ battleId ปัจจุบันแล้ว (battleId = null นับว่ารู้แล้ว: ไม่มีเกม)
export function useTeamBattleStatus(battleId: string | null): { status: BattleStatus | null; loaded: boolean } {
  const [state, setState] = useState<{ id: string; status: BattleStatus | null } | null>(null);

  useEffect(() => {
    if (!battleId) return;
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function load() {
      const { data } = await supabase.from("pvp_team_battles").select("status").eq("id", battleId!).maybeSingle();
      if (!cancelled) setState({ id: battleId!, status: (data?.status as BattleStatus | undefined) ?? null });
    }

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(session?.access_token ?? null);
      } catch {
        /* subscribe callback รายงาน error เอง */
      }
      if (cancelled) return;
      void load();
      channel = supabase
        .channel(`team_battle_status:${battleId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "pvp_team_battles", filter: `id=eq.${battleId}` },
          (payload) => {
            if (cancelled) return;
            const s = (payload.new as { status?: BattleStatus }).status;
            if (s) setState({ id: battleId, status: s });
          }
        )
        .subscribe((st) => {
          if (!cancelled && st === "SUBSCRIBED") void load();
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [battleId]);

  if (!battleId) return { status: null, loaded: true };
  const mine = state?.id === battleId;
  return { status: mine ? state!.status : null, loaded: mine };
}
