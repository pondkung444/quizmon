import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createBattle, resolveTurn, type Battle } from "../../src/lib/raid/cards/engine.ts";

// Run the actual migration and existing production start/reward functions against PostgreSQL.
// Only the surrounding schema/data is reduced; no reward or permission RPC is mocked.
test("PostgreSQL: ownership, keys, CAS, legacy isolation and idempotent rewards", async () => {
  const db = new PGlite();
  const user = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
  const pet = "00000000-0000-4000-8000-000000000003";
  const mist = "00000000-0000-4000-8000-000000000004";
  const gale = "00000000-0000-4000-8000-000000000005";
  const storm = "00000000-0000-4000-8000-000000000006";
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on all functions in schema auth to anon, authenticated, service_role;
      create table egg_types(id text primary key, name_th text, stat_profile jsonb);
      create table pets(id uuid primary key,user_id uuid,stage int,is_active boolean,egg_type_id text,stat_hp int,stat_atk int,stat_def int,stat_spd int,stat_foc int);
      create table raid_types(id uuid primary key,slug text,is_active boolean,zone_id uuid,sort_order int,obstacle_count int,boss_threshold_pct numeric);
      create table raid_tickets(id uuid primary key default gen_random_uuid(),user_id uuid,zone_id uuid,consumed_at timestamptz,consumed_run_id uuid,granted_at timestamptz default now());
      create table raid_runs(id uuid primary key default gen_random_uuid(),user_id uuid,pet_id uuid,raid_type_id uuid,ticket_id uuid,stat_snapshot jsonb,caps_snapshot jsonb,threshold_pct numeric,gauge_max int,gauge_earned int default 0,fail_count int default 0,phase text default 'choosing',status text default 'in_progress',outcome text,gear_item_id uuid,completed_at timestamptz,egg_awarded boolean default false,egg_type_id text);
      create table raid_run_steps(run_id uuid,step_index int,option_a_obstacle_id uuid,option_a_color text,option_b_obstacle_id uuid,option_b_color text);
      create table raid_obstacles(id uuid default gen_random_uuid(),stat text,is_active boolean,zone_id uuid);
      create table raid_gear_items(id uuid primary key default gen_random_uuid(),owner_user_id uuid,equipped_pet_id uuid,slot text,main_stat text,main_value int,sub_stat text,sub_value int,quality text,source_run_id uuid);
      create table raid_quality_thresholds(raid_type_id uuid,min_score_pct numeric,quality_code text);
      create table raid_gear_qualities(code text,main_value int,sub_value int);
      create table raid_pity(user_id uuid,reward_tier text,meter int,primary key(user_id,reward_tier));
      create table player_eggs(id uuid default gen_random_uuid(),user_id uuid,egg_type_id text,source text);
      insert into auth.users values('${user}'),('${other}');
      insert into egg_types values('basic','Basic','{"caps":{"hp":150,"atk":150,"def":150,"spd":150,"foc":150}}'),('egg_epic_01','Epic','{}');
      insert into pets values('${pet}','${user}',4,false,'basic',130,130,130,130,130);
      insert into raid_types values('${mist}','ridge_mist',true,'${mist}',1,2,45),('${gale}','ridge_gale',true,'${mist}',2,2,60),('${storm}','ridge_storm',true,'${mist}',3,2,75);
      insert into raid_obstacles(stat,is_active,zone_id) values('atk',true,'${mist}'),('def',true,'${mist}');
      insert into raid_tickets(user_id,zone_id) select '${user}','${mist}' from generate_series(1,10);
      insert into raid_quality_thresholds values(null,0,'q1'),(null,80,'q3'),(null,95,'q4');
      insert into raid_gear_qualities values('q1',3,null),('q3',8,3),('q4',12,5);
      grant all on all tables in schema public to service_role;
    `);
    const legacy = readFileSync(new URL("../../supabase/migrations/20260904180000_remove_raid_allowlist_gate_from_rpcs.sql", import.meta.url), "utf8");
    for (const name of ["start_raid_run", "claim_raid_reward"]) {
      const start = legacy.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      const end = legacy.indexOf("$function$;", start) + "$function$;".length;
      assert.ok(start >= 0 && end > start);
      await db.exec(legacy.slice(start,end));
    }
    await db.exec(readFileSync(new URL("../../supabase/migrations/20260910044249_raid_card_battles_v2.sql",import.meta.url),"utf8"));
    async function as(role: string, id = user) { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`); }
    async function scalar(sql: string, params: unknown[] = []) { return (await db.query<{value: string}>(sql,params)).rows[0]?.value; }
    async function start(type = mist) { return await scalar("select start_raid_card_run($1,$2) as value",[pet,type]); }
    async function commit(run: string, rev: number, state: Battle) {
      const result = await db.query<{value:{revision:number;state:Battle}}>("select commit_raid_card_turn($1,$2,$3,$4::jsonb) as value",[run,user,rev,JSON.stringify(state)]);
      return result.rows[0].value;
    }
    await as("authenticated",other);
    await assert.rejects(start(),/Qmon/);
    await as("authenticated");
    await assert.rejects(start(gale),/ด่านก่อนหน้า/);
    const run = (await start())!;
    assert.equal(await start(),run);
    await assert.rejects(db.query("select * from claim_raid_reward($1)",[run]),/ยังรับของไม่ได้/);
    await assert.rejects(db.query("select * from claim_raid_card_reward($1)",[run]),/ยังรับรางวัลไม่ได้/);
    let state = createBattle("ridge_mist",{hp:130,atk:130,def:130,spd:130,foc:130},()=>0.5);
    await assert.rejects(commit(run,0,state),/permission denied/);
    await assert.rejects(db.exec("update raid_card_battles set revision=99"),/permission denied/);
    await as("authenticated",other);
    assert.equal((await db.query("select * from raid_card_battles")).rows.length,0);
    await as("service_role");
    assert.equal(await scalar("select count(*)::text as value from raid_tickets where consumed_at is not null"),"1");
    assert.equal(await scalar("select count(*)::text as value from raid_run_steps"),"0");
    let revision = (await commit(run,0,state)).revision;
    const next = resolveTurn(state,"strike",()=>0.5);
    const [a,b] = await Promise.all([commit(run,revision,next),commit(run,revision,next)]);
    assert.deepEqual(a,b); assert.equal(a.revision,revision+1);
    state = a.state; revision = a.revision;
    while (!state.outcome) { state=resolveTurn(state,"strike",()=>0.5); revision=(await commit(run,revision,state)).revision; }
    assert.equal(state.outcome,"win");
    assert.equal(await scalar("select phase as value from raid_runs where id=$1",[run]),"card_reward");
    await as("authenticated",other);
    await assert.rejects(db.query("select * from claim_raid_card_reward($1)",[run]),/ยังรับรางวัลไม่ได้/);
    await as("authenticated");
    const first = await db.query("select * from claim_raid_card_reward($1)",[run]);
    const retry = await db.query("select * from claim_raid_card_reward($1)",[run]);
    assert.deepEqual(first.rows,retry.rows);
    await as("service_role");
    assert.equal(await scalar("select count(*)::text as value from raid_gear_items"),"1");
    // The old RPC and its step format still work, and block starting a new card run.
    await as("authenticated");
    const old = await scalar("select (start_raid_run($1,$2)).id::text as value",[pet,gale]);
    await assert.rejects(start(),/รอบเดิม/);
    await as("service_role");
    assert.equal(await scalar("select count(*)::text as value from raid_run_steps where run_id=$1",[old]),"2");
    await db.query("update raid_runs set phase='done',status='completed',outcome='win' where id=$1",[old]);
    // Actual first-clear and pity code, including a previous legacy win in the chain.
    for (let round=0; round<2; round++) {
      await as("authenticated"); const bossRun=(await start(storm))!;
      await as("service_role");
      let battle=createBattle("ridge_storm",{hp:130,atk:130,def:130,spd:130,foc:130},()=>0.5);
      let rev=(await commit(bossRun,0,battle)).revision;
      while(!battle.outcome) { battle=resolveTurn(battle,"strike",()=>0.5); rev=(await commit(bossRun,rev,battle)).revision; }
      assert.equal(battle.outcome,"win");
      if(round===1) await db.query("insert into raid_pity values($1,'epic',10) on conflict(user_id,reward_tier) do update set meter=10",[user]);
      await as("authenticated");
      const reward=await db.query<{egg_awarded:boolean;egg_type_id:string}>("select * from claim_raid_card_reward($1)",[bossRun]);
      assert.equal(reward.rows[0].egg_awarded,true); assert.equal(reward.rows[0].egg_type_id,"egg_epic_01");
      await db.query("select * from claim_raid_card_reward($1)",[bossRun]);
    }
    await as("service_role");
    assert.equal(await scalar("select count(*)::text as value from player_eggs"),"2");
    assert.equal(await scalar("select meter::text as value from raid_pity"),"0");
    await as("postgres");
    await db.exec(`
      create table profiles(id uuid primary key,grade_band text);
      create table questions(id bigint primary key,status text,grade_band text,question_text text,choices jsonb,correct_index integer,explanation text,image_url text,subject text,category text);
      create table quiz_attempts(id bigint generated always as identity primary key,user_id uuid,pet_id uuid,question_id bigint,is_correct boolean,source text,raid_run_id uuid,created_at timestamptz default now());
      insert into profiles values('${user}','junior');
      insert into questions select n,'active','junior','Question '||n,'["right","wrong"]',0,'Because...',null,'math','multiply' from generate_series(1,30) n;
      insert into questions values(999,'active','senior','Wrong grade','["right","wrong"]',0,'',null,'math','multiply');
      grant all on profiles,questions,quiz_attempts to service_role;
      grant usage,select on all sequences in schema public to service_role;
    `);
    await db.exec(readFileSync(new URL("../../supabase/migrations/20260910044259_raid_card_learning.sql",import.meta.url),"utf8"));
    await as("authenticated");
    const learningRun=(await start())!;
    await assert.rejects(db.query("select * from raid_card_questions"),/permission denied/);
    await as("service_role");
    let learning=createBattle("ridge_mist",{hp:130,atk:130,def:130,spd:130,foc:130},()=>0.5);
    let rev=(await commit(learningRun,0,learning)).revision;
    await assert.rejects(commit(learningRun,rev,resolveTurn(learning,"strike",()=>0.5)),/Answer a question/);
    while(!learning.outcome) {
      await db.query("select prepare_raid_card_question($1,$2,$3,'strike')",[learningRun,user,rev]);
      await db.query("select prepare_raid_card_question($1,$2,$3,'guard')",[learningRun,user,rev]);
      const chosen=await db.query<{card_id:string;question_id:number}>("select card_id,question_id from raid_card_questions where run_id=$1 and revision=$2",[learningRun,rev]);
      assert.equal(chosen.rows[0].card_id,"strike"); assert.notEqual(chosen.rows[0].question_id,999);
      const next=resolveTurn(learning,"strike",()=>0.5,true);
      await assert.rejects(db.query("select answer_raid_card_question($1,$2,$3,1,$4)",[learningRun,user,rev,JSON.stringify(next)]),/mismatch/);
      const first=await db.query<{value:{revision:number}}>("select answer_raid_card_question($1,$2,$3,0,$4) as value",[learningRun,user,rev,JSON.stringify(next)]);
      const retry=await db.query("select answer_raid_card_question($1,$2,$3,1,$4) as value",[learningRun,user,rev,JSON.stringify(next)]);
      assert.deepEqual(first.rows,retry.rows);
      learning=next;rev=first.rows[0].value.revision;
    }
    assert.equal(await scalar("select count(*)::text as value from quiz_attempts"),String(learning.log.length));
    assert.equal(await scalar("select count(distinct question_id)::text as value from raid_card_questions"),String(learning.log.length));
    await as("authenticated");
    await db.query("select * from claim_raid_card_reward($1)",[learningRun]);
  } finally { await db.close(); }
});
