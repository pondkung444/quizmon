import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('student board migration ranks validated three-act progress with ties, best runs and restricted stats',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema public,auth to anon,authenticated,service_role;
   create table public.profiles(id uuid primary key,username text);grant select on profiles to service_role;
   insert into auth.users values('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333'),('66666666-6666-4666-8666-666666666666');
   insert into profiles select id,'fixture' from auth.users;`);
  await db.exec(fs.readFileSync('doc/forest2048-competition-schema.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261005171205_forest2048_three_acts_student_board.sql','utf8'));
  await db.exec(`insert into forest2048_runs(user_id,completed_rooms,engine_state) values('22222222-2222-4222-8222-222222222222',99,'{"run":{"endlessVersion":1,"history":[]}}');`);
  await db.exec(fs.readFileSync('tests/forest2048/student-board-verification.sql','utf8'));
  await db.exec('set role service_role');
  const board=(await db.query('select forest2048_acts_board(null,0) as board')).rows[0].board;
  assert.equal(board.players,0);assert.deepEqual(board.leaders,[]);
  await db.exec('reset role;set role authenticated');
  await assert.rejects(db.query('select forest2048_acts_stats(null)'));
  await assert.rejects(db.query('select forest2048_acts_board(null,0)'));
 } finally {await db.close();}
});
