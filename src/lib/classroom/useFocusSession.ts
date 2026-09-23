"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { ClassroomSession } from "./useClassroomLobby";

// คาบตั้งใจ — realtime hook (pattern เดียวกับ useClassroomLobby: setAuth ก่อน subscribe,
// refetch ทุกครั้งที่ SUBSCRIBED, cancelled guard) ไม่ import จาก/แก้ useBossRaidLobby

export type FocusSession = {
  id: string;
  classroom_session_id: string;
  teacher_id: string;
  status: "running" | "ended";
  started_at: string;
  ended_at: string | null;
  ended_reason: "host_ended" | "stale_timeout" | null;
};

export type FocusParticipant = {
  focus_session_id: string;
  user_id: string;
  joined_at: string;
  focused_seconds: number;
  warned_count: number;
  exp_awarded: number;
};

// "กำลังรัน" ต้องเช็คครบทุกข้อ — current_activity เดี่ยวๆ อาจค้าง (Raid/Focus จบแล้วแต่ยังเป็นค่าเดิม)
export function isFocusRunning(
  room: Pick<ClassroomSession, "status" | "current_activity" | "active_focus_session_id"> | null,
  focus: FocusSession | null
): boolean {
  return (
    !!room &&
    room.status !== "ended" &&
    room.current_activity === "focus_mode" &&
    !!room.active_focus_session_id &&
    focus?.id === room.active_focus_session_id &&
    focus.status === "running"
  );
}

type State = {
  focusSession: FocusSession | null;
  myParticipant: FocusParticipant | null;
  /** ครูเท่านั้น — จำนวนอย่างเดียว ไม่เปิดรายชื่อ/ข้อมูลรายคน */
  participantCount: number;
  /** true เมื่อดึงแถวผู้เข้าร่วมของรอบนี้ครั้งแรกเสร็จแล้ว (กันเรียก join ก่อนรู้ว่ามีแถวอยู่แล้ว) */
  participantsLoaded: boolean;
  connected: boolean;
};

const PARTICIPANT_REFETCH_DEBOUNCE_MS = 300;

export function useFocusSession(
  classroomSessionId: string,
  activeFocusSessionId: string | null
): State {
  const [focusSession, setFocusSession] = useState<FocusSession | null>(null);
  const [participants, setParticipants] = useState<{
    focusId: string;
    rows: FocusParticipant[];
    userId: string | null;
  } | null>(null);
  const [connected, setConnected] = useState(false);

  // (1) เห็น active_focus_session_id บน classroom_sessions ให้ดึงแถวนั้นทันที — ไม่รอ event ของ channel
  useEffect(() => {
    if (!activeFocusSessionId) return;
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("classroom_focus_sessions")
        .select("*")
        .eq("id", activeFocusSessionId)
        .maybeSingle();
      if (cancelled || !data) return;
      setFocusSession(data as FocusSession);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFocusSessionId]);

  // (2) channel ของ focus session ในห้องนี้ (start / end)
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function refetch() {
      const { data } = await supabase
        .from("classroom_focus_sessions")
        .select("*")
        .eq("classroom_session_id", classroomSessionId)
        .eq("status", "running")
        .maybeSingle();
      if (cancelled) return;
      // ไม่มีรอบที่รันอยู่ = ไม่ทับรอบที่จบแล้วด้วย null (event/ดึงตาม id จะเป็นตัวบอกสถานะ ended)
      if (data) {
        setFocusSession(data as FocusSession);
      } else {
        setFocusSession((prev) => (prev && prev.status === "running" ? { ...prev, status: "ended" } : prev));
      }
    }

    void (async () => {
      try {
        const {
          data: { session: auth },
        } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(auth?.access_token ?? null);
      } catch {
        /* ปล่อยให้ subscribe callback รายงาน CHANNEL_ERROR เอง */
      }
      if (cancelled) return;

      channel = supabase
        .channel(`classroom-focus:${classroomSessionId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "classroom_focus_sessions",
            filter: `classroom_session_id=eq.${classroomSessionId}`,
          },
          (payload) => {
            if (cancelled || payload.eventType === "DELETE") return;
            const row = payload.new as FocusSession;
            setFocusSession((prev) => {
              // รอบที่จบแล้วและไม่ใช่รอบปัจจุบัน ไม่ต้องทับรอบที่กำลังโชว์อยู่
              if (row.status === "ended" && prev && prev.id !== row.id) return prev;
              return row;
            });
          }
        )
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status !== "SUBSCRIBED") {
            console.info(`[focus ${classroomSessionId.slice(0, 8)}] channel status:`, status, err ?? "");
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
  }, [classroomSessionId]);

  // (3) ผู้เข้าร่วมของรอบที่ active — RLS: นักเรียนได้แถวตัวเองแถวเดียว, ครูได้ทั้งรอบ
  useEffect(() => {
    if (!activeFocusSessionId) return;
    const focusId = activeFocusSessionId;
    const supabase = createClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function refetch() {
      const [{ data: rows }, { data: userData }] = await Promise.all([
        supabase
          .from("classroom_focus_participants")
          .select("focus_session_id, user_id, joined_at, focused_seconds, warned_count, exp_awarded")
          .eq("focus_session_id", focusId),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      setParticipants({
        focusId,
        rows: (rows as FocusParticipant[] | null) ?? [],
        userId: userData.user?.id ?? null,
      });
    }

    function scheduleRefetch() {
      // ตอนครูกดเริ่ม RPC ใส่ผู้เข้าร่วมทั้งห้องพร้อมกัน → รวม event เป็น refetch ครั้งเดียว
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!cancelled) void refetch();
      }, PARTICIPANT_REFETCH_DEBOUNCE_MS);
    }

    void (async () => {
      try {
        const {
          data: { session: auth },
        } = await supabase.auth.getSession();
        await supabase.realtime.setAuth(auth?.access_token ?? null);
      } catch {
        /* เหมือนด้านบน */
      }
      if (cancelled) return;

      channel = supabase
        .channel(`classroom-focus-participants:${focusId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "classroom_focus_participants",
            filter: `focus_session_id=eq.${focusId}`,
          },
          () => {
            if (!cancelled) scheduleRefetch();
          }
        )
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status !== "SUBSCRIBED") {
            console.info(`[focus-participants ${focusId.slice(0, 8)}] channel status:`, status, err ?? "");
          }
          if (status === "SUBSCRIBED") void refetch();
        });
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [activeFocusSessionId]);

  const current = participants && participants.focusId === activeFocusSessionId ? participants : null;
  const myParticipant =
    current && current.userId ? (current.rows.find((r) => r.user_id === current.userId) ?? null) : null;

  return {
    focusSession,
    myParticipant,
    participantCount: current?.rows.length ?? 0,
    participantsLoaded: current !== null,
    connected,
  };
}

/** วินาทีที่ผ่านไปตั้งแต่ startedAt (เวลาเซิร์ฟเวอร์) — tick ในเครื่องทุก 1 วินาที */
export function useElapsedSeconds(startedAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
}

export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
