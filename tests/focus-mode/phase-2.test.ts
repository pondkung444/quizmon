import test from "node:test";
import { check, createFocusDb, OUT, ROOM, S1, S2, T } from "./harness.ts";

// คาบตั้งใจ Phase 2 — state machine ฝั่ง server (heartbeat / grace / reset / finalize)

test("focus mode phase 2: heartbeat, grace, reset and finalize", async () => {
  const h = await createFocusDb();
  const { db, call, hb, sig, tick, part, lastEvent } = h;
  try {
// --- launch
await h.launch();
check("participants start away", (await part(S1)).focus_state === "away");

// --- not participant
let r = await hb(OUT);
check("outsider heartbeat rejected", r.error?.includes("not_a_focus_participant"), r);
r = await sig(S1, "bogus");
check("invalid signal rejected", r.error?.includes("invalid_focus_signal"), r);

// --- resume starts a block
r = await sig(S1, "resume");
check("resume → focusing", r.state === "focusing" && r.completed_blocks === 0, r);

// --- block completes after 10 min of heartbeats
await tick(590);
r = await hb(S1);
check("9m50s → no block yet", r.completed_blocks === 0 && r.state === "focusing", r);
await tick(15);
r = await hb(S1);
check("10m05s → 1 block, grace fresh", r.completed_blocks === 1 && r.grace_used === false, r);

// --- touch → warning → resume in time → continue; 2nd touch same block → reset
r = await sig(S1, "screen_touch");
check("touch → warning", r.state === "warning" && r.grace_used === true && r.warned_count === 1, r);
r = await sig(S1, "screen_touch");
check("touch while warning = same break", r.state === "warning", r);
await tick(3);
r = await sig(S1, "resume");
check("resume within grace → focusing, block kept", r.state === "focusing" && r.completed_blocks === 1, r);
r = await sig(S1, "tab_change");
check("2nd break in block → reset", r.state === "away", r);
check("reset reason second_break", (await lastEvent(S1, "reset"))?.meta?.reason === "second_break");
const fsAfter = (await part(S1)).focused_seconds;
check("focused_seconds credited (~608s)", fsAfter >= 600 && fsAfter <= 612, fsAfter);

// --- grace expiry
r = await sig(S1, "resume");
check("resume after reset → new block from 0", r.state === "focusing" && r.grace_used === false, r);
r = await sig(S1, "background");
check("background → warning", r.state === "warning", r);
await tick(12, { heartbeats: false });
r = await sig(S1, "foreground", { hidden_ms: 12000 });
check("back after 12s → away (foreground doesn't start block)", r.state === "away", r);
r = await sig(S1, "resume");
check("resume → new block", r.state === "focusing" && r.grace_used === false, r);
check("reset reason grace_expired", (await lastEvent(S1, "reset"))?.meta?.reason === "grace_expired");

// --- retro: background signal lost, foreground reports hidden 6s → uses grace; then hidden 4s → reset
await tick(20);
await db.exec(`update public.classroom_focus_heartbeats set last_heartbeat_at = now() - interval '9 seconds' where focus_session_id='${h.focus}' and user_id='${S1}'`);
r = await sig(S1, "foreground", { hidden_ms: 6000 });
check("retro hidden 6s → grace used, still focusing", r.state === "focusing" && r.grace_used === true, r);
r = await sig(S1, "foreground", { hidden_ms: 4000 });
// 2nd retro → reset, then foreground itself starts a new block
check("retro 2nd hidden → away", r.state === "away", r);
r = await sig(S1, "resume");
check("reset retro second_break", (await lastEvent(S1, "reset"))?.meta?.reason === "second_break");

// --- retro hidden 15s w/o grace used → reset grace_expired
await tick(5);
r = await sig(S1, "foreground", { hidden_ms: 15000 });
check("retro hidden 15s → reset (grace_expired)", (await lastEvent(S1, "reset"))?.meta?.reason === "grace_expired" && r.state === "away", r);

// --- block not credited when it completes while hidden
r = await sig(S1, "resume"); // noop focusing
await tick(595);
r = await sig(S1, "foreground", { hidden_ms: 15000 });
check("block that 'completed' while hidden is not credited", r.completed_blocks === 1 && r.state === "away", r);

// --- heartbeat timeout
r = await sig(S2, "resume");
check("S2 focusing", r.state === "focusing", r);
await tick(30, { heartbeats: false });
r = await hb(S2);
check("silent 30s → away on next heartbeat", r.state === "away", r);
check("heartbeat_timeout logged", !!(await lastEvent(S2, "heartbeat_timeout")));
r = await sig(S2, "resume");

// --- wake lock unsupported logged once
await sig(S2, "wake_lock_unsupported", { ua: "x" });
await sig(S2, "wake_lock_unsupported", { ua: "x" });
const wl = (await db.query<{ c: number }>(`select count(*)::int c from public.classroom_focus_events where event_type='wake_lock_unsupported'`)).rows[0].c;
check("wake_lock_unsupported logged once", wl === 1, wl);

// --- teacher live summary (S2 silent → counted as away after lazy eval)
await tick(40, { heartbeats: false });
r = await call(T, `select public.get_focus_live_summary($1)`, [h.focus]);
check("live summary lazily evaluates silent students", r.away === 2 && r.focusing === 0 && r.total === 2, r);
r = await call(S1, `select public.get_focus_live_summary($1)`, [h.focus]);
check("student cannot read live summary", r.error?.includes("not_authorized_or_not_found"), r);

// --- end: finalize credits running presence
r = await sig(S1, "resume");
await tick(100);
r = await call(T, `select public.end_focus_mode_session($1)`, [h.focus]);
check("end returns summary", r.already_ended === false && r.participant_count === 2 && "completed_blocks" in r, r);
check("after end everyone away", (await part(S1)).focus_state === "away");
check("session_ended reset logged", (await lastEvent(S1, "reset"))?.meta?.reason === "session_ended");
r = await hb(S1);
check("heartbeat after end → status ended", r.status === "ended", r);
r = await call(T, `select public.end_focus_mode_session($1)`, [h.focus]);
check("end idempotent", r.already_ended === true, r);
const room = (await db.query<{ current_activity: string | null }>(`select current_activity from public.classroom_sessions where id='${ROOM}'`)).rows[0];
check("room back to lobby", room.current_activity === null, room);

// --- close class while running → finalize via trigger
await h.launch();
await sig(S1, "resume");
await tick(700);
await db.exec(`update public.classroom_sessions set status='ended', current_activity=null where id='${ROOM}'`);
const fsess = (await db.query<{ status: string; ended_reason: string }>(`select status, ended_reason from public.classroom_focus_sessions where id=$1`, [h.focus])).rows[0];
const p1 = await part(S1);
check("class end → focus ended host_ended", fsess.status === "ended" && fsess.ended_reason === "host_ended", fsess);
check("class end → block credited + away", p1.completed_blocks === 1 && p1.focus_state === "away" && p1.focused_seconds >= 700, p1);

// --- grants
const g = (await db.query<Record<"a" | "b" | "c" | "d", boolean>>(`select has_function_privilege('authenticated','public.focus_advance_participant(uuid,uuid,timestamptz)','execute') a,
  has_function_privilege('authenticated','public.report_focus_heartbeat(uuid)','execute') b,
  has_function_privilege('anon','public.report_focus_signal(uuid,text,jsonb)','execute') c,
  has_table_privilege('authenticated','public.classroom_focus_heartbeats','select') d`)).rows[0];
check("internal fn not executable by authenticated", g.a === false, g);
check("heartbeat executable by authenticated", g.b === true, g);
check("signal not executable by anon", g.c === false, g);
check("heartbeats table not readable", g.d === false, g);

  } finally {
    await db.close();
  }
});
