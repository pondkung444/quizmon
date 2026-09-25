"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FOCUS_GRACE_MS,
  FOCUS_HEARTBEAT_MS,
  FOCUS_SETTLE_MS,
  FOCUS_TOUCH_QUIET_MS,
} from "./focusRules";

// คาบตั้งใจ Phase 2 — ตัวจับสัญญาณฝั่งนักเรียน
// server เป็นคนตัดสินทุกอย่าง (report_focus_heartbeat / report_focus_signal) hook นี้แค่:
//   * ส่ง heartbeat ทุก 10 วิ ตอนหน้าจอเปิดอยู่
//   * ส่งสัญญาณหลุด: background (ออกจากแอป/ล็อกจอ), tab_change (หน้าต่างเสีย focus), screen_touch (แตะจอ)
//   * ส่ง foreground พร้อม hidden_ms ตอนกลับมา (server ตัดสินย้อนหลังถ้าสัญญาณ background ส่งไม่ทัน)
//   * ส่ง resume เมื่อวางนิ่งพอ (ไม่แตะจอ) — ปิด warning หรือเริ่มก้อนใหม่
//   * ขอ Wake Lock กันจอดับเอง (ไม่รองรับ = fail-closed: จอดับเมื่อไหร่นับว่าหลุด แต่แจ้งนักเรียนให้รู้ก่อน)
// เรียก RPC จาก browser ตรง ไม่ผ่าน server action (ยิงถี่ ทุกคนในห้อง)

export type FocusRunningState = {
  status: "running";
  state: "focusing" | "warning" | "away";
  present_since: string | null;
  block_started_at: string | null;
  grace_used: boolean;
  warning_started_at: string | null;
  completed_blocks: number;
  focused_seconds: number;
  warned_count: number;
  /** EXP ที่จะได้ถ้าคาบจบตอนนี้ (หักเพดานวันนี้แล้ว) */
  exp_pending: number;
  /** เพดาน EXP คาบตั้งใจที่เหลือวันนี้ (ไม่นับรอบนี้) */
  exp_cap_left: number;
  server_now: string;
};

type FocusRpcResult = FocusRunningState | { status: "ended"; server_now: string };

type SignalType =
  | "background"
  | "tab_change"
  | "screen_touch"
  | "foreground"
  | "resume"
  | "wake_lock_unsupported";

export type WakeLockStatus = "pending" | "active" | "unsupported" | "denied";

/** ถือว่าขาดการเชื่อมต่อเมื่อไม่มีคำตอบจาก server นานเท่านี้ (ตรงกับ heartbeat timeout ฝั่ง server) */
const OFFLINE_AFTER_MS = 25 * 1000;
const TICK_MS = 500;

export type FocusTracker = {
  /** null = ยังไม่ได้คำตอบแรกจาก server */
  server: FocusRunningState | null;
  /** เวลา server - เวลาเครื่อง (ms) ใช้คำนวณเวลาก้อน/นับถอยหลังให้ตรงกับที่ server ตัดสิน */
  offsetMs: number;
  /** Date.now() ที่ tick ทุก 0.5 วิ (render นาฬิกา/นับถอยหลัง) */
  now: number;
  /** แตะจอล่าสุด (Date.now()) — ใช้แสดงนับถอยหลัง "วางนิ่ง" */
  lastTouchAt: number;
  wakeLock: WakeLockStatus;
  online: boolean;
};

export function useFocusTracker(focusSessionId: string | null): FocusTracker {
  const supabase = useMemo(() => createClient(), []);
  const [server, setServer] = useState<FocusRunningState | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // เปิดหน้า = เพิ่งถือเครื่อง (ตรงกับ lastTouch เริ่มต้นใน effect)
  const [lastTouchAt, setLastTouchAt] = useState(() => Date.now());
  const [lastOkAt, setLastOkAt] = useState(() => Date.now());
  const [wakeLock, setWakeLock] = useState<WakeLockStatus>("pending");

  useEffect(() => {
    if (!focusSessionId) return;
    const id = focusSessionId;
    let cancelled = false;

    // คำตอบมาไม่เรียงได้ (heartbeat กับสัญญาณยิงซ้อนกัน) → ใช้เฉพาะคำตอบของคำขอที่ใหม่กว่าที่ใช้ไปแล้ว
    let seq = 0;
    let appliedSeq = 0;
    let current: FocusRunningState | null = null;
    let touchBreakSent = false;
    let resumeInFlight = false;
    let refreshedWarningAt: string | null = null;
    let hiddenAt: number | null = null;
    let blurred = false;
    let lastTouch = Date.now(); // เพิ่งเปิดหน้า = เพิ่งถือเครื่อง ต้องวางนิ่งก่อนเริ่มนับ
    let sentinel: WakeLockSentinel | null = null;
    let wakeLockRequesting = false;
    let wakeLockReported = false;
    let lastForegroundAt = 0;

    function apply(data: FocusRpcResult) {
      if (data.status !== "running") return; // จบคาบ — หน้าห้องสลับกลับเองผ่าน realtime ของ useFocusSession
      current = data;
      if (data.state === "focusing") touchBreakSent = false;
      setServer(data);
      setOffsetMs(Date.parse(data.server_now) - Date.now());
    }

    async function send(kind: "heartbeat" | SignalType, meta?: Record<string, unknown>) {
      const mySeq = ++seq;
      const { data, error } =
        kind === "heartbeat"
          ? await supabase.rpc("report_focus_heartbeat", { p_focus_session_id: id })
          : await supabase.rpc("report_focus_signal", {
              p_focus_session_id: id,
              p_event_type: kind,
              p_meta: meta ?? {},
            });
      if (cancelled) return;
      if (error || !data) {
        console.info(`[focus ${id.slice(0, 8)}] ${kind} failed:`, error?.message ?? "no data");
        return;
      }
      setLastOkAt(Date.now());
      if (mySeq < appliedSeq) return;
      appliedSeq = mySeq;
      apply(data as FocusRpcResult);
    }

    // ครั้งเดียวต่อรอบ (server กันซ้ำด้วย) — แนบ user agent ไว้ไล่ว่าเครื่อง/เบราว์เซอร์ไหนไม่ยอม
    function reportWakeLock(reason: string, trigger: string) {
      if (wakeLockReported) return;
      wakeLockReported = true;
      void send("wake_lock_unsupported", { reason, trigger, ua: navigator.userAgent.slice(0, 300) });
    }

    // trigger: mount | visible | touch — บางเบราว์เซอร์ (เช่นโหมดประหยัดแบต / WebKit บางรุ่น) ปฏิเสธจนกว่า
    // ผู้ใช้จะแตะจอ จึงลองใหม่ตอนแตะด้วย (ช่วงยังไม่เริ่มนับ แตะได้ไม่เสียรอบ)
    async function requestWakeLock(trigger: string) {
      if (!("wakeLock" in navigator)) {
        setWakeLock("unsupported");
        reportWakeLock("api_missing", trigger);
        return;
      }
      if (document.visibilityState !== "visible" || sentinel || wakeLockRequesting) return;
      wakeLockRequesting = true;
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setWakeLock("active");
        // เบราว์เซอร์ปล่อย lock เองเมื่อหน้าถูกซ่อน — ขอใหม่ตอนกลับมา (visibilitychange)
        s.addEventListener("release", () => {
          sentinel = null;
          if (!cancelled) setWakeLock("pending");
        });
      } catch (e) {
        if (!cancelled) setWakeLock("denied");
        reportWakeLock(e instanceof Error ? e.name : "request_failed", trigger);
      } finally {
        wakeLockRequesting = false;
      }
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        // อาจส่งไม่ทันก่อน JS ถูกหยุด — ไม่เป็นไร foreground ส่ง hidden_ms ไปให้ตัดสินย้อนหลังอีกที
        if (current?.state === "focusing") void send("background");
        return;
      }
      const hiddenMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      lastTouch = Date.now(); // เพิ่งหยิบเครื่องกลับมา
      setLastTouchAt(lastTouch);
      lastForegroundAt = Date.now();
      void send("foreground", { hidden_ms: hiddenMs });
      void requestWakeLock("visible");
    }

    function onBlur() {
      if (document.visibilityState !== "visible") return; // visibilitychange จัดการแล้ว
      blurred = true;
      if (current?.state === "focusing") void send("tab_change");
    }

    function onFocus() {
      if (!blurred) return;
      blurred = false;
      // หน้าถูกซ่อนด้วย (สลับหน้าต่าง/แอป) → visibilitychange ส่ง foreground พร้อม hidden_ms จริงแล้ว
      // หรือกำลังจะส่ง ไม่ต้องส่งซ้ำ (focus กับ visibilitychange มาไม่เรียงกันแน่นอน)
      if (hiddenAt !== null || Date.now() - lastForegroundAt < 1000) return;
      if (current?.state === "warning") void send("foreground", { hidden_ms: 0 });
    }

    function onTouch() {
      lastTouch = Date.now();
      setLastTouchAt(lastTouch);
      if (!sentinel) void requestWakeLock("touch");
      // ส่งครั้งเดียวต่อช่วงแตะ — แตะรัวๆ ระหว่าง warning คือการหลุดครั้งเดิม
      if (current?.state === "focusing" && !touchBreakSent) {
        touchBreakSent = true;
        void send("screen_touch");
      }
    }

    function tick() {
      const t = Date.now();
      setNow(t);
      const s = current;
      if (!s || resumeInFlight || document.visibilityState !== "visible" || blurred) return;
      const quiet = t - lastTouch;

      const shouldResume =
        (s.state === "away" && quiet >= FOCUS_SETTLE_MS) ||
        (s.state === "warning" && quiet >= FOCUS_TOUCH_QUIET_MS);
      if (shouldResume) {
        resumeInFlight = true;
        void send("resume").finally(() => {
          resumeInFlight = false;
        });
        return;
      }

      // grace หมดแล้วตามนาฬิกา server → ถามสถานะใหม่ทันที ไม่ต้องรอ heartbeat รอบหน้า
      if (s.state === "warning" && s.warning_started_at && refreshedWarningAt !== s.warning_started_at) {
        const deadline = Date.parse(s.warning_started_at) + FOCUS_GRACE_MS - (Date.parse(s.server_now) - t);
        if (t > deadline + 500) {
          refreshedWarningAt = s.warning_started_at;
          void send("heartbeat");
        }
      }
    }

    function heartbeat() {
      if (document.visibilityState === "visible") void send("heartbeat");
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pointerdown", onTouch, { capture: true, passive: true });
    window.addEventListener("keydown", onTouch, { capture: true });
    const tickTimer = setInterval(tick, TICK_MS);
    const hbTimer = setInterval(heartbeat, FOCUS_HEARTBEAT_MS);

    void send("heartbeat"); // ขอสถานะแรก
    void requestWakeLock("mount");

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pointerdown", onTouch, { capture: true });
      window.removeEventListener("keydown", onTouch, { capture: true });
      clearInterval(tickTimer);
      clearInterval(hbTimer);
      if (sentinel) void sentinel.release();
    };
  }, [focusSessionId, supabase]);

  return {
    server,
    offsetMs,
    now,
    lastTouchAt,
    wakeLock,
    online: now - lastOkAt < OFFLINE_AFTER_MS,
  };
}
