import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL("../../supabase/migrations/20260910114449_raid_card_question_mix.sql", import.meta.url), "utf8");
const user = "00000000-0000-4000-8000-000000000001";
const run = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";

test("raid question mix: grade isolation, balanced subjects/chapters, retries and exhausted pools", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid primary key,grade_band text);
      create table raid_runs(id uuid primary key,user_id uuid);
      create table raid_card_battles(run_id uuid primary key,revision int,finished_at timestamptz,state jsonb);
      create table questions(id bigint generated always as identity primary key,status text,grade_band text,subject text,branch text,category text,question_text text,choices jsonb,correct_index int,explanation text,image_url text);
      create table quiz_attempts(user_id uuid,question_id bigint,source text,is_correct boolean,created_at timestamptz default now());
      create table raid_card_questions(run_id uuid,revision int,card_id text,question_id bigint,question jsonb,correct_index int,explanation text,primary key(run_id,revision));
      insert into profiles values('${user}','junior');
      insert into raid_runs values('${run}','${user}');
      insert into raid_card_battles values('${run}',1,null,'{"energy":5,"hand":["counter"]}');
      -- Highly uneven pools: a raw random question draw would favor chapter A.
      insert into questions(status,grade_band,subject,branch,category,question_text,choices,correct_index,explanation,image_url)
      select 'active',band,subject,branch,category,'Question','["right","wrong"]',0,'Explanation','data:image/svg+xml,test'
      from (values ('junior','math',null),('junior','science',null),
        ('senior','math','physics'),('senior','science','chemistry'),('senior','science','biology')) subjects(band,subject,branch)
      cross join (values ('A',100),('B',12),('C',12)) chapters(category,pool_size)
      cross join lateral generate_series(1,chapters.pool_size) n;
      -- Invalid/inactive entries must never reach a player.
      insert into questions(status,grade_band,subject,category,choices,correct_index)
      values ('inactive','junior','bad','bad','["a","b"]',0),
        ('active','junior','bad','bad','{}',0),('active','senior','bad','bad','["a"]',0),
        ('active','senior','bad','bad','["a","b"]',5);
      -- Reproduce the old bias: both recent raid mistakes and weak quiz history in A.
      insert into quiz_attempts(user_id,question_id,source,is_correct)
      select '${user}',id,'raid_boss',false from questions where category='A';
      insert into quiz_attempts(user_id,question_id,source,is_correct)
      select '${user}',id,null,false from questions where category='A';
      grant usage on schema public to service_role;
      grant all on all tables in schema public to service_role;
      grant usage,select on all sequences in schema public to service_role;
    `);
    await db.exec(migration);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select prepare_raid_card_question($1,$2,1,'strike')",[run,user]),/permission denied/);
    await db.exec("reset role; set role service_role");
    const prepare = (revision: number, card = "strike", id = user) => db.query("select prepare_raid_card_question($1,$2,$3,$4)",[run,id,revision,card]);
    for (const band of ["junior","senior"]) {
      await db.query("update profiles set grade_band=$1 where id=$2",[band,user]);
      await db.exec("delete from raid_card_questions");
      for (let revision=1; revision<=20; revision++) {
        await db.query("update raid_card_battles set revision=$1",[revision]);
        await assert.rejects(prepare(revision,"strike",other),/ไม่พบรอบ/);
        await prepare(revision);
        const before = await db.query("select * from raid_card_questions where revision=$1",[revision]);
        await prepare(revision,"guard");
        const after = await db.query("select * from raid_card_questions where revision=$1",[revision]);
        assert.deepEqual(after.rows,before.rows,"retry must keep the same question and card");
      }
      const picked = (await db.query<{id:number;grade_band:string;subject:string;branch:string|null;category:string;question:{imageUrl:string}}>(
        "select q.*,picked.question from raid_card_questions picked join questions q on q.id=picked.question_id order by picked.revision"
      )).rows;
      assert.equal(picked.length,20);
      assert.equal(new Set(picked.map(q=>q.id)).size,20,"no repeated questions in a run");
      assert.ok(picked.every(q=>q.grade_band===band && q.subject!=="bad"));
      assert.ok(picked.every(q=>q.question.imageUrl==="data:image/svg+xml,test"),"preserve image payload");
      const subjects = band==="junior" ? ["math","science"] : ["physics","chemistry","biology"];
      const counts = subjects.map(subject => {
        const questions = picked.filter(q=>(band==="junior"?q.subject:q.branch)===subject);
        const chapterCounts = ["A","B","C"].map(category=>questions.filter(q=>q.category===category).length);
        assert.ok(Math.min(...chapterCounts)>0,`${band}/${subject}: visit every chapter despite mistakes in A`);
        assert.ok(Math.max(...chapterCounts)-Math.min(...chapterCounts)<=1,`${band}/${subject}: balanced chapters`);
        return questions.length;
      });
      assert.ok(Math.max(...counts)-Math.min(...counts)<=1,`${band}: balanced learning subjects`);
    }
    // Unknown grade must fail instead of silently serving junior content.
    await db.exec("delete from raid_card_questions; update raid_card_battles set revision=1; update profiles set grade_band=null");
    await assert.rejects(prepare(1),/เลือกช่วงชั้น/);
    // Continue through available subjects when a chapter/subject runs out.
    await db.exec("update profiles set grade_band='junior'; update questions set status='inactive'");
    const ids=(await db.query<{id:number}>("select min(id) as id from questions where grade_band='junior' and category in ('A','B') group by subject,category order by subject,category limit 3")).rows.map(q=>q.id);
    await db.query("update questions set status='active' where id=any($1::bigint[])",[ids]);
    for(let revision=1;revision<=3;revision++) {
      await db.query("update raid_card_battles set revision=$1",[revision]);
      await prepare(revision);
    }
    assert.equal((await db.query("select distinct question_id from raid_card_questions")).rows.length,3);
    await db.exec("update raid_card_battles set revision=4");
    await assert.rejects(prepare(4),/ยังไม่มีโจทย์ใหม่/);
  } finally { await db.close(); }
});
