import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// คาบตั้งใจ Phase 2 — state machine ฝั่ง server (heartbeat / grace / reset / finalize)
// schema อื่นของระบบ stub ไว้ขั้นต่ำ แล้วรัน migration ของ focus ทั้ง 3 ไฟล์ตามลำดับจริง
// จำลองเวลาเดินด้วยการเลื่อน timestamp ของรอบย้อนหลัง (now() ของ Postgres เลื่อนไม่ได้)

test("focus mode phase 2: heartbeat, grace, reset and finalize", async () => {
const db = new PGlite();
try {
const T = "00000000-0000-0000-0000-00000000000a"; // teacher
const S1 = "00000000-0000-0000-0000-000000000001";
const S2 = "00000000-0000-0000-0000-000000000002";
const OUT = "00000000-0000-0000-0000-000000000009"; // not in class
const ROOM = "10000000-0000-0000-0000-000000000001";

await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.classroom_sessions (
  id uuid primary key, teacher_id uuid, status text not null default 'open',
  current_activity text, active_boss_raid_session_id uuid,
  constraint classroom_sessions_current_activity_check check (current_activity is null or current_activity in ('name_picker','boss_raid')));
create table public.classroom_participants (session_id uuid, user_id uuid);
create table public.boss_raid_sessions (id uuid primary key, status text);
create table public.classroom_boss_raids (classroom_session_id uuid, boss_raid_session_id uuid);
create function public.is_teacher() returns boolean language sql as $$ select true $$;
create function public.is_classroom_member(p uuid) returns boolean language sql as $$
  select exists (select 1 from public.classroom_participants where session_id = p and user_id = auth.uid()) $$;
create function public.resolve_boss_raid_session(p uuid, r text) returns void language sql as $$ select $$;
create publication supabase_realtime;
insert into auth.users values ('${T}'),('${S1}'),('${S2}'),('${OUT}');
insert into public.classroom_sessions (id, teacher_id) values ('${ROOM}', '${T}');
insert into public.classroom_participants values ('${ROOM}','${S1}'),('${ROOM}','${S2}');
`);
for (const f of [
  "20260923145950_classroom_focus_mode_phase_1.sql",
  "20260925180000_classroom_end_closes_focus.sql",
  "20260925190000_classroom_focus_mode_phase_2.sql",
]) {
  await db.exec(readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8"));
}
await db.exec(`create trigger t_end after update of status on public.classroom_sessions for each row
  when (new.status = 'ended' and old.status <> 'ended') execute function public.classroom_end_open_boss_raids();`);

function check(name: string, cond: unknown, extra?: unknown) {
  assert.ok(cond, `${name}: ${JSON.stringify(extra)}`);
}
// ผลของ RPC (jsonb) — ฟิลด์ที่ test อ่าน
type Res = {
  error?: string;
  status?: string;
  state?: string;
  grace_used?: boolean;
  warned_count?: number;
  completed_blocks?: number;
  already_ended?: boolean;
  participant_count?: number;
  total?: number;
  focusing?: number;
  away?: number;
};
type Part = { focus_state: string; focused_seconds: number; completed_blocks: number };
type Ev = { meta: { reason?: string } };

async function call(uid: string, sql: string, params: unknown[] = []): Promise<Res> {
  try {
    await db.exec(`select set_config('test.uid', '${uid}', false)`);
    const rows = (await db.query<Record<string, unknown>>(sql, params)).rows;
    return Object.values(rows[0])[0] as Res;
  } catch (e) {
    return { error: (e as Error).message };
  }
}
let FOCUS = "";
const hb = (u: string) => call(u, `select public.report_focus_heartbeat($1)`, [FOCUS]);
const sig = (u: string, t: string, meta: Record<string, unknown> = {}) => call(u, `select public.report_focus_signal($1,$2,$3)`, [FOCUS, t, meta]);
// จำลองเวลาเดินไป n วินาที = เลื่อน timestamp ทุกอันของรอบนี้ย้อนหลัง n วินาที
async function tick(n: number, { heartbeats = true } = {}) {
  await db.exec(`
    update public.classroom_focus_participants set
      present_since = present_since - interval '${n} seconds',
      block_started_at = block_started_at - interval '${n} seconds',
      warning_started_at = warning_started_at - interval '${n} seconds'
    where focus_session_id = '${FOCUS}';
    update public.classroom_focus_heartbeats set last_heartbeat_at = last_heartbeat_at - interval '${n} seconds'
    where focus_session_id = '${FOCUS}';
    update public.classroom_focus_sessions set started_at = started_at - interval '${n} seconds' where id = '${FOCUS}';
  `);
  if (heartbeats) {
    // client ที่ยังอยู่ ping ทุก 10 วิ → heartbeat ล่าสุดไม่เกิน 10 วิที่แล้ว
    await db.exec(`update public.classroom_focus_heartbeats set last_heartbeat_at = greatest(last_heartbeat_at, now() - interval '5 seconds') where focus_session_id = '${FOCUS}'`);
  }
}
async function part(u: string) {
  return (await db.query<Part>(`select * from public.classroom_focus_participants where focus_session_id=$1 and user_id=$2`, [FOCUS, u])).rows[0];
}
async function lastEvent(u: string, type: string): Promise<Ev | undefined> {
  return (await db.query<Ev>(`select * from public.classroom_focus_events where focus_session_id=$1 and user_id=$2 and event_type=$3 order by id desc limit 1`, [FOCUS, u, type])).rows[0];
}

// --- launch
const launched = (await call(T, `select (public.launch_focus_mode_from_classroom($1)).id`, [ROOM])) as unknown;
check("launch creates focus", typeof launched === "string", launched);
FOCUS = launched as string;
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
await db.exec(`update public.classroom_focus_heartbeats set last_heartbeat_at = now() - interval '9 seconds' where focus_session_id='${FOCUS}' and user_id='${S1}'`);
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
r = await call(T, `select public.get_focus_live_summary($1)`, [FOCUS]);
check("live summary lazily evaluates silent students", r.away === 2 && r.focusing === 0 && r.total === 2, r);
r = await call(S1, `select public.get_focus_live_summary($1)`, [FOCUS]);
check("student cannot read live summary", r.error?.includes("not_authorized_or_not_found"), r);

// --- end: finalize credits running presence
r = await sig(S1, "resume");
await tick(100);
r = await call(T, `select public.end_focus_mode_session($1)`, [FOCUS]);
check("end returns summary", r.already_ended === false && r.participant_count === 2 && "completed_blocks" in r, r);
check("after end everyone away", (await part(S1)).focus_state === "away");
check("session_ended reset logged", (await lastEvent(S1, "reset"))?.meta?.reason === "session_ended");
r = await hb(S1);
check("heartbeat after end → status ended", r.status === "ended", r);
r = await call(T, `select public.end_focus_mode_session($1)`, [FOCUS]);
check("end idempotent", r.already_ended === true, r);
const room = (await db.query<{ current_activity: string | null }>(`select current_activity from public.classroom_sessions where id='${ROOM}'`)).rows[0];
check("room back to lobby", room.current_activity === null, room);

// --- close class while running → finalize via trigger
FOCUS = (await call(T, `select (public.launch_focus_mode_from_classroom($1)).id`, [ROOM])) as unknown as string;
await sig(S1, "resume");
await tick(700);
await db.exec(`update public.classroom_sessions set status='ended', current_activity=null where id='${ROOM}'`);
const fsess = (await db.query<{ status: string; ended_reason: string }>(`select status, ended_reason from public.classroom_focus_sessions where id=$1`, [FOCUS])).rows[0];
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
