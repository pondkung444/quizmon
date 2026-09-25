import test from "node:test";
import { check, createFocusDb, ROOM, S1, S2, T } from "./harness.ts";

// คาบตั้งใจ Phase 4 — reaper ปิดคาบที่ไม่มีความเคลื่อนไหวเกิน 60 นาที + สรุปรวมฝั่งครู

test("focus mode phase 4: stale reaper and teacher summary", async () => {
  const h = await createFocusDb();
  const { db, call, sig, tick, part, hb } = h;
  const reap = async () =>
    (await db.query<{ n: number }>(`select public.close_stale_focus_sessions() as n`)).rows[0].n;
  const sess = async () =>
    (await db.query<{ status: string; ended_reason: string | null; ended_at: Date | null }>(
      `select status, ended_reason, ended_at from public.classroom_focus_sessions where id=$1`, [h.focus])).rows[0];
  const room = async () =>
    (await db.query<{ current_activity: string | null }>(
      `select current_activity from public.classroom_sessions where id=$1`, [ROOM])).rows[0];
  try {
    const cron = (await db.query<{ schedule: string; command: string }>(
      `select schedule, command from cron.job where jobname='close-stale-focus-sessions'`)).rows[0];
    check("cron scheduled every 5 min", cron?.schedule === "*/5 * * * *" && cron.command.includes("close_stale_focus_sessions"), cron);

    // --- คาบที่ยังมีคนตั้งใจอยู่ ไม่ถูกปิด แม้ยาวเกิน 60 นาที
    await h.launch();
    await sig(S1, "resume");
    await tick(3700); // heartbeat ยังมา
    await hb(S1);
    check("active long round not reaped", (await reap()) === 0 && (await sess()).status === "running");

    // --- ทุกคนเงียบเกิน 60 นาที → ปิด (ได้ EXP ตามก้อนที่ครบก่อนเงียบ)
    await tick(3700, { heartbeats: false });
    check("idle > 60 min reaped", (await reap()) === 1);
    let s = await sess();
    check("ended as stale_timeout", s.status === "ended" && s.ended_reason === "stale_timeout", s);
    const idleFor = (Date.now() - new Date(s.ended_at!).getTime()) / 1000;
    check("ended_at = last activity, not cron time", idleFor > 3600, idleFor);
    const p = await part(S1);
    check("blocks before silence credited + EXP awarded", p.completed_blocks === 6 && p.exp_awarded === 50 && p.focus_state === "away", p);
    check("room back to lobby", (await room()).current_activity === null);
    check("reaper idempotent", (await reap()) === 0);

    // --- สรุปของครูหลังจบ
    const r = await call(T, `select public.get_focus_live_summary($1)`, [h.focus]);
    check("summary has aggregate end fields",
      r.status === "ended" && r.ended_reason === "stale_timeout" && r.total === 2 &&
      r.focused_students === 1 && r.exp_awarded === 50 && (r.focused_seconds ?? 0) > 3600, r);
    check("student cannot read summary", !!(await call(S2, `select public.get_focus_live_summary($1)`, [h.focus])).error);

    // --- คาบที่เพิ่งเริ่ม (ยังไม่มีใครวาง) ไม่ถูกปิด
    await h.launch();
    check("fresh round not reaped", (await reap()) === 0);
    s = await sess();
    check("fresh round still running", s.status === "running", s);

    // --- สิทธิ์
    const g = (await db.query<Record<"a" | "b", boolean>>(`select
      has_function_privilege('authenticated','public.close_stale_focus_sessions(integer)','execute') a,
      has_function_privilege('authenticated','public.finalize_focus_session(uuid,text,timestamptz)','execute') b`)).rows[0];
    check("reaper/finalize not callable by clients", g.a === false && g.b === false, g);
  } finally {
    await db.close();
  }
});
