"use client";

import { useEffect, useState } from "react";
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
};

export type LobbyParticipant = {
  id: string;
  user_id: string;
  pet_id: string;
  stat_snapshot: Record<string, number>;
  joined_at: string;
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

    const channel = supabase
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
      .subscribe((status) => {
        if (cancelled) return;
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (ok) void refetch(); // §12.4 — resync ทุกครั้งที่ (re)subscribe สำเร็จ
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // initial.session ตั้งใจไม่ใส่ใน deps — ใช้แค่เป็น fallback ตอน merge, ไม่ต้อง resubscribe เมื่อมันเปลี่ยน
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { session, participants, connected };
}
