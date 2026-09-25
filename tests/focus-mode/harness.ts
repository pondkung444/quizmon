import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// ฐานข้อมูลทดสอบคาบตั้งใจ: schema อื่นของระบบ stub ไว้ขั้นต่ำ แล้วรัน migration ของ focus ทุกไฟล์ตามลำดับจริง
// จำลองเวลาเดินด้วยการเลื่อน timestamp ของรอบย้อนหลัง (now() ของ Postgres เลื่อนไม่ได้)

export const T = "00000000-0000-0000-0000-00000000000a"; // ครู
export const S1 = "00000000-0000-0000-0000-000000000001";
export const S2 = "00000000-0000-0000-0000-000000000002";
export const OUT = "00000000-0000-0000-0000-000000000009"; // ไม่ได้อยู่ในห้อง
export const ROOM = "10000000-0000-0000-0000-000000000001";
export const ROOM2 = "10000000-0000-0000-0000-000000000002";
export const PET1 = "20000000-0000-0000-0000-000000000001"; // ตัวที่ S1 กำลังเลี้ยง
export const PET1_OLD = "20000000-0000-0000-0000-000000000011"; // ตัวเก่าของ S1 (ไม่ active)

const MIGRATIONS = [
  "20260923145950_classroom_focus_mode_phase_1.sql",
  "20260925180000_classroom_end_closes_focus.sql",
  "20260925190000_classroom_focus_mode_phase_2.sql",
  "20260925200000_classroom_focus_mode_phase_3.sql",
];

// ผลของ RPC (jsonb) — ฟิลด์ที่ test อ่าน
export type Res = {
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
  exp_awarded?: number;
  exp_pending?: number;
  exp_cap_left?: number;
};
export type Part = {
  focus_state: string;
  focused_seconds: number;
  completed_blocks: number;
  exp_awarded: number;
  exp_awarded_at: Date | null;
  exp_pet_id: string | null;
};
export type Ev = { meta: { reason?: string; earned?: number; awarded?: number } };

export function check(name: string, cond: unknown, extra?: unknown) {
  assert.ok(cond, `${name}: ${JSON.stringify(extra)}`);
}

export async function createFocusDb() {
  const db = new PGlite();
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
create table public.pets (
  id uuid primary key, user_id uuid not null, exp integer not null default 0,
  exp_today integer not null default 0, is_active boolean not null default true);
create function public.is_teacher() returns boolean language sql as $$ select true $$;
create function public.is_classroom_member(p uuid) returns boolean language sql as $$
  select exists (select 1 from public.classroom_participants where session_id = p and user_id = auth.uid()) $$;
create function public.resolve_boss_raid_session(p uuid, r text) returns void language sql as $$ select $$;
create publication supabase_realtime;
insert into auth.users values ('${T}'),('${S1}'),('${S2}'),('${OUT}');
insert into public.classroom_sessions (id, teacher_id) values ('${ROOM}', '${T}'), ('${ROOM2}', '${T}');
insert into public.classroom_participants values ('${ROOM}','${S1}'),('${ROOM}','${S2}'),('${ROOM2}','${S1}');
insert into public.pets (id, user_id, exp, is_active) values ('${PET1}', '${S1}', 100, true), ('${PET1_OLD}', '${S1}', 999, false);
`);
  for (const f of MIGRATIONS) {
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), "utf8"));
  }
  await db.exec(`create trigger t_end after update of status on public.classroom_sessions for each row
  when (new.status = 'ended' and old.status <> 'ended') execute function public.classroom_end_open_boss_raids();`);

  let focus = "";

  async function call(uid: string, sql: string, params: unknown[] = []): Promise<Res> {
    try {
      await db.exec(`select set_config('test.uid', '${uid}', false)`);
      const rows = (await db.query<Record<string, unknown>>(sql, params)).rows;
      return Object.values(rows[0])[0] as Res;
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  return {
    db,
    get focus() {
      return focus;
    },
    call,
    async launch(room = ROOM) {
      const id = (await call(T, `select (public.launch_focus_mode_from_classroom($1)).id`, [room])) as unknown;
      check("launch creates focus", typeof id === "string", id);
      focus = id as string;
      return focus;
    },
    hb: (u: string) => call(u, `select public.report_focus_heartbeat($1)`, [focus]),
    sig: (u: string, t: string, meta: Record<string, unknown> = {}) =>
      call(u, `select public.report_focus_signal($1,$2,$3)`, [focus, t, meta]),
    end: () => call(T, `select public.end_focus_mode_session($1)`, [focus]),
    // จำลองเวลาเดินไป n วินาที = เลื่อน timestamp ทุกอันของรอบนี้ย้อนหลัง n วินาที
    async tick(n: number, { heartbeats = true } = {}) {
      await db.exec(`
        update public.classroom_focus_participants set
          present_since = present_since - interval '${n} seconds',
          block_started_at = block_started_at - interval '${n} seconds',
          warning_started_at = warning_started_at - interval '${n} seconds'
        where focus_session_id = '${focus}';
        update public.classroom_focus_heartbeats set last_heartbeat_at = last_heartbeat_at - interval '${n} seconds'
        where focus_session_id = '${focus}';
        update public.classroom_focus_sessions set started_at = started_at - interval '${n} seconds' where id = '${focus}';
      `);
      if (heartbeats) {
        // client ที่ยังอยู่ ping ทุก 10 วิ → heartbeat ล่าสุดไม่เกิน 10 วิที่แล้ว
        await db.exec(`update public.classroom_focus_heartbeats set last_heartbeat_at = greatest(last_heartbeat_at, now() - interval '5 seconds') where focus_session_id = '${focus}'`);
      }
    },
    async part(u: string) {
      return (await db.query<Part>(`select * from public.classroom_focus_participants where focus_session_id=$1 and user_id=$2`, [focus, u])).rows[0];
    },
    async lastEvent(u: string, type: string): Promise<Ev | undefined> {
      return (await db.query<Ev>(`select * from public.classroom_focus_events where focus_session_id=$1 and user_id=$2 and event_type=$3 order by id desc limit 1`, [focus, u, type])).rows[0];
    },
  };
}
