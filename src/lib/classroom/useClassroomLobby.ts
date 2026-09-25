"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { ClassroomRosterRow } from "./roster";

// Teacher Classroom Hub — realtime hook, mirror ของ src/lib/bossRaid/useBossRaidLobby.ts
// (1 channel ต่อ 1 classroom session, setAuth ก่อน subscribe กัน RLS ผูกเป็น anon แล้ว event เงียบ
// — บั๊กเดิมของ boss raid TV เมื่อ 2026-09-02, ดู docs/boss-raid-tv-realtime-issue-2026-09-02.md)
//
// participants = roster จาก RPC get_classroom_roster (ชื่อ + Qmon) ไม่ใช่ select ตรง เพราะ RLS
// ไม่ให้ครูอ่าน profiles/pets ของนักเรียน. Presence บน channel เดียวกัน: นักเรียน track ตัวเอง
// (trackPresenceAs) ส่วนครูแค่อ่าน onlineIds — ใช้โชว์ใครหลุด และสุ่มชื่อเฉพาะคนที่ออนไลน์

export type ClassroomSession = {
  id: string;
  teacher_id: string;
  join_code: string;
  title: string | null;
  status: "lobby" | "active" | "ended";
  current_activity: "name_picker" | "boss_raid" | "focus_mode" | null;
  active_boss_raid_session_id: string | null;
  active_focus_session_id: string | null;
  created_at: string;
  ended_at: string | null;
};

export type ClassroomParticipant = ClassroomRosterRow;

type State = {
  session: ClassroomSession | null;
  participants: ClassroomParticipant[];
  /** user_id ที่เปิดหน้าห้องอยู่ตอนนี้ (Presence) — null = ยังไม่ได้ sync ครั้งแรก */
  onlineIds: Set<string> | null;
  /** roster โหลดไม่ได้ = ไม่ได้เป็นสมาชิกห้องแล้ว (เช่น ถูกครูนำออก) */
  rosterDenied: boolean;
  connected: boolean;
  /** ดึง snapshot ห้องใหม่ — ใช้หลัง action สำเร็จ เผื่อ realtime หลุดชั่วคราว */
  refetch: () => Promise<void>;
};

export function useClassroomLobby(
  sessionId: string,
  initial: { session: ClassroomSession | null; participants: ClassroomParticipant[] },
  opts: { trackPresenceAs?: string } = {}
): State {
  const [session, setSession] = useState<ClassroomSession | null>(initial.session);
  const [participants, setParticipants] = useState<ClassroomParticipant[]>(initial.participants);
  const [onlineIds, setOnlineIds] = useState<Set<string> | null>(null);
  const [rosterDenied, setRosterDenied] = useState(false);
  const [connected, setConnected] = useState(false);
  const refetchRef = useRef<() => Promise<void>>(async () => {});
  const trackAs = opts.trackPresenceAs;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function refetch() {
      const [{ data: s }, { data: p, error: pErr }] = await Promise.all([
        supabase.from("classroom_sessions").select("*").eq("id", sessionId).maybeSingle(),
        supabase.rpc("get_classroom_roster", { p_session_id: sessionId }),
      ]);
      if (cancelled) return;
      setSession((s as ClassroomSession | null) ?? null);
      if (pErr) {
        setRosterDenied(pErr.message.includes("not_authorized_or_not_found"));
        return;
      }
      setRosterDenied(false);
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
        .channel(`classroom:${sessionId}`, trackAs ? { config: { presence: { key: trackAs } } } : undefined)
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
        .on("presence", { event: "sync" }, () => {
          if (cancelled || !channel) return;
          const state = channel.presenceState<{ user_id?: string }>();
          const ids = new Set<string>();
          for (const [key, metas] of Object.entries(state)) {
            ids.add(metas[0]?.user_id ?? key);
          }
          setOnlineIds(ids);
        })
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status !== "SUBSCRIBED") {
            console.info(`[classroom ${sessionId.slice(0, 8)}] channel status:`, status, err ?? "");
          }
          const ok = status === "SUBSCRIBED";
          setConnected(ok);
          if (ok) {
            void refetch();
            if (trackAs && channel) void channel.track({ user_id: trackAs });
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, trackAs]);

  return {
    session,
    participants,
    onlineIds,
    rosterDenied,
    connected,
    refetch: () => refetchRef.current(),
  };
}
