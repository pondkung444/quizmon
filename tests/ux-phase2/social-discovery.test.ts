import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../../supabase/migrations/20260916161315_social_discovery_safety.sql', import.meta.url), 'utf8');
function existingFunction(file: string, name: string) {
  const sql = readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8');
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `Missing ${name} in ${file}`);
  const end = sql.indexOf('$$;', sql.indexOf('as $$', start));
  return sql.slice(start, end + 3);
}
const phase3 = '20260814054111_profile_friends_phase3_friend_requests.sql';
const phase4 = '20260814075017_profile_friends_phase4_friend_list_block.sql';
const phase5 = '20260814081245_profile_friends_phase5_public_profile_likes.sql';
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const c = '00000000-0000-4000-8000-000000000003';

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.profiles(id uuid primary key, username text, friend_code text);
    create table public.blocks(blocker_id uuid, blocked_id uuid, primary key(blocker_id,blocked_id));
    create table public.friendships(user_id_low uuid, user_id_high uuid, primary key(user_id_low,user_id_high));
    create function public.friend_ids(p_user_id uuid) returns table(friend_id uuid) language sql as $$
      select case when user_id_low=p_user_id then user_id_high else user_id_low end from public.friendships where p_user_id in (user_id_low,user_id_high) $$;
    create table public.friend_requests(id uuid primary key default gen_random_uuid(), requester_id uuid, addressee_id uuid, status text, created_at timestamptz default now(), responded_at timestamptz);
    create unique index pending_pair on public.friend_requests(requester_id,addressee_id) where status='pending';
    create table public.profile_settings(user_id uuid, pride_pet_id uuid);
    create table public.pets(id uuid, user_id uuid, is_active boolean, nickname text, stage smallint, subline text, personality text, egg_type_id uuid);
    create table public.egg_types(id uuid, sprite_prefix text, name_th text);
    create table public.profile_likes(liker_id uuid, profile_user_id uuid);
    create table public.encouragements(sender_id uuid,recipient_id uuid);
    insert into auth.users values ('${a}'),('${b}'),('${c}');
    insert into public.profiles values ('${a}','UX Sender','AAAA1234'),('${b}','UX_เพื่อน%','BBBB1234'),('${c}','UX_เพื่อน%','CCCC1234');
  `);
  for (const [file, name] of [[phase3, '_expire_stale_friend_requests'], [phase5, '_compute_relationship_status'], [phase5, 'search_friend_code'], [phase4, 'send_friend_request'], [phase3, 'respond_friend_request'], [phase4, 'block_user'], [phase4, 'unblock_user']]) {
    await db.exec(existingFunction(file, name));
  }
  await db.exec(migration);
  await db.exec(`grant execute on function public.respond_friend_request(uuid,text),public.block_user(uuid),public.unblock_user(uuid) to authenticated;`);
  return db;
}
async function asUser(db: PGlite, id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}

test('social discovery preserves request/accept and hides blocks in both directions', async () => {
  const db = await fixture();
  try {
    await asUser(db, a);
    const names = await db.query<{target_user_id:string}>('select * from public.search_friend_name($1)', ['UX_เพื่อน%']);
    assert.deepEqual(names.rows.map(row => row.target_user_id), [b,c]);
    assert.equal((await db.query('select * from public.search_friend_name($1)', ['UX%'])).rows.length, 0);
    const request = await db.query<{request_id:string,auto_accepted:boolean}>('select * from public.send_friend_request($1)', [b]);
    assert.equal(request.rows[0].auto_accepted, false);
    await assert.rejects(db.query('select * from public.send_friend_request($1)', [b]), /ค้างอยู่แล้ว/);
    await assert.rejects(db.query('select * from public.respond_friend_request($1,$2)', [request.rows[0].request_id,'accept']), /ไม่พบคำขอ/);
    await asUser(db,b);
    await db.query('select * from public.respond_friend_request($1,$2)', [request.rows[0].request_id,'accept']);
    await asUser(db,a);
    assert.equal((await db.query<{relationship_status:string}>('select * from public.search_friend_code($1)', ['BBBB1234'])).rows[0].relationship_status,'friends');
    await asUser(db,b);
    await db.query('select public.block_user($1)',[a]);
    assert.equal((await db.query('select * from public.search_friend_name($1)', ['UX Sender'])).rows.length,0);
    await asUser(db,a);
    const hidden = await db.query<{found:boolean,username:null}>('select * from public.search_friend_code($1)', ['BBBB1234']);
    assert.equal(hidden.rows[0].found,false); assert.equal(hidden.rows[0].username,null);
    assert.deepEqual((await db.query<{target_user_id:string}>('select * from public.search_friend_name($1)', ['UX_เพื่อน%'])).rows.map(row=>row.target_user_id),[c]);
    await assert.rejects(db.query('select * from public.send_friend_request($1)',[b]), /ไม่พบผู้เล่น/);
    await asUser(db,b); await db.query('select public.unblock_user($1)',[a]);
    await asUser(db,a);
    assert.equal((await db.query<{relationship_status:string}>('select * from public.search_friend_code($1)', ['BBBB1234'])).rows[0].relationship_status,'available');
  } finally { await db.close(); }
});

test('search quotas persist across RPC calls, recover after window and isolate accounts', async () => {
  const db = await fixture();
  try {
    await asUser(db,a);
    for(let i=0;i<20;i++) await db.query('select * from public.search_friend_name($1)',['ไม่พบ']);
    await assert.rejects(db.query('select * from public.search_friend_name($1)',['ไม่พบ']),/ถี่เกินไป/);
    await asUser(db,b); await db.query('select * from public.search_friend_name($1)',['ไม่พบ']);
    await db.exec('reset role');
    await db.query("update social_private.action_windows set started_at=clock_timestamp()-interval '2 minutes' where user_id=$1",[a]);
    await asUser(db,a); await db.query('select * from public.search_friend_name($1)',['ไม่พบ']);
    for(let i=0;i<60;i++) await db.query('select * from public.search_friend_code($1)',['ZZZZ9999']);
    await assert.rejects(db.query('select * from public.search_friend_code($1)',['ZZZZ9999']),/ถี่เกินไป/);
    await assert.rejects(db.query('select * from social_private.action_windows'),/permission denied/);
    await assert.rejects(db.query("select social_private.consume_action('name_search')"),/permission denied/);
    await db.exec('reset role');
    const columns = (await db.query('select * from public.search_friend_name($1)',['ไม่พบ'])).fields.map(field=>field.name);
    assert.ok(!columns.includes('friend_code') && !columns.includes('email'));
    await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon");
    await assert.rejects(db.query('select * from public.search_friend_name($1)',['ไม่พบ']),/permission denied/);
    await assert.rejects(db.query('select * from public.search_friend_code($1)',['BBBB1234']),/permission denied/);
    await assert.rejects(db.query('select * from public.send_friend_request($1)',[b]),/permission denied/);
  } finally { await db.close(); }
});

test('direct request RPC enforces the per-minute successful-send quota', async()=>{
  const db=await fixture();
  try {
    await db.exec('reset role');
    for(let i=10;i<21;i++) {
      const id=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
      await db.query('insert into auth.users values($1)',[id]);
      await db.query('insert into public.profiles values($1,$2,$3)',[id,`UX ${i}`,`TEST00${i}`]);
    }
    await asUser(db,a);
    for(let i=10;i<20;i++) await db.query('select * from public.send_friend_request($1)',[`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`]);
    await assert.rejects(db.query('select * from public.send_friend_request($1)',['00000000-0000-4000-8000-000000000020']),/ถี่เกินไป/);
  } finally { await db.close(); }
});
