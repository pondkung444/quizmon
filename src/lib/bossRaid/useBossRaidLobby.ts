"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// §12 Connection Resilience — จอครู/ทีวี/นักเรียน subscribe state ห้องเดียวกันผ่าน Supabase Realtime
// realtime hook ตัวแรกของ repo (survey: ไม่มี postgres_changes ที่อื่นเลย) — convention ให้เฟสถัดไป reuse:
//   - 1 channel ต่อ 1 session ชื่อ `boss-raid:<sessionId>`
//   - subscribe UPDATE ของ sessions + ทุก event ของ participants (filter session_id)
//   - §12.4 reconnect: ทุกครั้งที่ status = 'SUBSCRIBED' (รวมตอน rejoin หลังหลุด) -> refetch snapshot เต็ม
//     กัน event ที่ตกหล่นช่วง socket ปิด
//   - cleanup: removeChannel + guard กัน setState หลัง unmount เสมอ
//   - createClient() (@supabase/ssr) เป็น singleton ต่อ browser tab อยู่แล้ว เรียกซ้ำได้

export type LobbySession = {
  id: string;
  status: "lobby" | "in_progress" | "ended";
  join_code: string;
  config: { chapter_ids?: number[]; difficulty?: string; timer_seconds?: number };
  teacher_id: string;
  boss_hp?: number | null;
  boss_hp_max?: number | null;
  crystal_hp?: number | null;
  crystal_hp_max?: number | null;
  current_tier?: "light" | "medium" | "heavy" | null;
  wrong_count_total?: number | null;
  result?: "win" | "lose" | null;
};

export type LobbyParticipant = {
  id: string;
  user_id: string;
  pet_id: string;
  stat_snapshot: Record<string, number>;
  joined_at: string;
  current_question_id?: number | null;
  question_started_at?: string | null;
};

type State = {
  session: LobbySession | null;
  participants: LobbyParticipant[];
  connected: boolean;
};

export function useBossRaidLobby(
  sessionId: string,
  initial: { session: LobbySession | null; participants: LobbyParticipant[] }
): State {
  const [session, setSession] = useState<LobbySession | null>(initial.session);
  const [participants, setParticipants] = useState<LobbyParticipant[]>(initial.participants);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function refetch() {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from("boss_raid_sessions").select("*").eq("id", sessionId).maybeSingle(),
        supabase
          .from("boss_raid_participants")
          .select("*")
          .eq("session_id", sessionId)
          .order("joined_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setSession((s as LobbySession | null) ?? null);
      setParticipants((p as LobbyParticipant[] | null) ?? []);
    }

    // ให้ realtime socket ถือ JWT ของผู้ใช้ก่อนสร้าง postgres_changes binding — ไม่งั้น binding
    // ผูกในบทบาท anon, is_boss_raid_member() RLS เท็จทุกครั้ง -> SUBSCRIBED แต่ไม่มี event
    // (@supabase/ssr browser client เปิด socket ด้วย anon key ก่อน setAuth ทีหลัง; issue 2026-09-02)
    void (async () => {
      try {
        const {
          data: { session: auth },
        } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(auth?.access_token ?? null);
      } catch {
        /* setAuth ล้มเหลว — ปล่อยให้ subscribe callback รายงาน CHANNEL_ERROR เอง */
      }
      if (cancelled) return;

      channel = supabase
      .channel(`boss-raid:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "boss_raid_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          if (cancelled) return;
          // merge: payload.new อาจไม่ครบทุกคอลัมน์ถ้า replica identity ไม่ full — เผื่อไว้
          setSession(
            (prev) => ({ ...(prev ?? initial.session), ...payload.new } as LobbySession)
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boss_raid_participants", filter: `session_id=eq.${sessionId}` },
        () => {
          if (!cancelled) void refetch();
        }
      )
      .subscribe((status, err) => {
        if (cancelled) return;
        if (status !== "SUBSCRIBED") {
          console.info(`[boss-raid ${sessionId.slice(0, 8)}] channel status:`, status, err ?? "");
        }
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (ok) void refetch(); // §12.4 — resync ทุกครั้งที่ (re)subscribe สำเร็จ
      });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // initial.session ตั้งใจไม่ใส่ใน deps — ใช้แค่เป็น fallback ตอน merge, ไม่ต้อง resubscribe เมื่อมันเปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { session, participants, connected };
}
