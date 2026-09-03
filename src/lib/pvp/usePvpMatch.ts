"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// realtime แมตช์ประลอง — 1 channel ต่อ 1 แมตช์ `pvp:<matchId>`
// pattern เดียวกับ useBossRaidLobby: setAuth ก่อน bind (ไม่งั้น RLS ผูกในบทบาท anon แล้วไม่มี event),
// เรียก onChange ทุกครั้งที่ (re)subscribe สำเร็จ (resync กัน event ตกหล่นช่วง socket ปิด)
//
// จอดวลเป็น server component — onChange = router.refresh() ให้ props ใหม่ไหลลงมา
export function usePvpMatch(matchId: string, onChange: () => void) {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(session?.access_token ?? null);
      } catch {
        /* subscribe callback จะรายงาน error เอง */
      }
      if (cancelled) return;

      channel = supabase
        .channel(`pvp:${matchId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "pvp_matches", filter: `id=eq.${matchId}` },
          () => {
            if (!cancelled) onChange();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pvp_match_cards",
            filter: `match_id=eq.${matchId}`,
          },
          () => {
            if (!cancelled) onChange();
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") onChange();
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);
}
