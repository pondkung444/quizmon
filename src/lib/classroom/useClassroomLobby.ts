"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Teacher Classroom Hub — realtime hook, mirror ของ src/lib/bossRaid/useBossRaidLobby.ts
// (1 channel ต่อ 1 classroom session, setAuth ก่อน subscribe กัน RLS ผูกเป็น anon แล้ว event เงียบ
// — บั๊กเดิมของ boss raid TV เมื่อ 2026-09-02, ดู docs/boss-raid-tv-realtime-issue-2026-09-02.md)

export type ClassroomSession = {
  id: string;
  teacher_id: string;
  join_code: string;
  status: "lobby" | "active" | "ended";
  current_activity: "name_picker" | "boss_raid" | "focus_mode" | null;
  active_boss_raid_session_id: string | null;
  active_focus_session_id: string | null;
  created_at: string;
  ended_at: string | null;
};

export type ClassroomParticipant = {
  session_id: string;
  user_id: string;
  joined_at: string;
};

type State = {
  session: ClassroomSession | null;
  participants: ClassroomParticipant[];
  connected: boolean;
  /** ดึง snapshot ห้องใหม่ — ใช้หลัง action สำเร็จ เผื่อ realtime หลุดชั่วคราว */
  refetch: () => Promise<void>;
};

export function useClassroomLobby(
  sessionId: string,
  initial: { session: ClassroomSession | null; participants: ClassroomParticipant[] }
): State {
  const [session, setSession] = useState<ClassroomSession | null>(initial.session);
  const [participants, setParticipants] = useState<ClassroomParticipant[]>(initial.participants);
  const [connected, setConnected] = useState(false);
  const refetchRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function refetch() {
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from("classroom_sessions").select("*").eq("id", sessionId).maybeSingle(),
        supabase
          .from("classroom_participants")
          .select("*")
          .eq("session_id", sessionId)
          .order("joined_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setSession((s as ClassroomSession | null) ?? null);
      setParticipants((p as ClassroomParticipant[] | null) ?? []);
    }

    refetchRef.current = refetch;

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
        .channel(`classroom:${sessionId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "classroom_sessions", filter: `id=eq.${sessionId}` },
          (payload) => {
            if (cancelled) return;
            setSession(
              (prev) => ({ ...(prev ?? initial.session), ...payload.new } as ClassroomSession)
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "classroom_participants",
            filter: `session_id=eq.${sessionId}`,
          },
          () => {
            if (!cancelled) void refetch();
          }
        )
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status !== "SUBSCRIBED") {
            console.info(`[classroom ${sessionId.slice(0, 8)}] channel status:`, status, err ?? "");
          }
          const ok = status === "SUBSCRIBED";
          setConnected(ok);
          if (ok) void refetch();
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return { session, participants, connected, refetch: () => refetchRef.current() };
}
