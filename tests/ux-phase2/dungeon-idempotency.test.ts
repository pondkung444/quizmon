import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("dungeon bonus migration removes old duplicates and rejects new ones", async () => {
  const db = new PGlite();
  const runId = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`
      create table public.quiz_attempts (
        id bigint generated always as identity primary key,
        source text not null,
        dungeon_run_id uuid,
        question_id bigint not null,
        is_correct boolean not null
      );
      insert into public.quiz_attempts(source,dungeon_run_id,question_id,is_correct)
      values ('dungeon_bonus','${runId}',10,true),('dungeon_bonus','${runId}',10,true);
    `);
    const migration = readFileSync(new URL("../../supabase/migrations/20260916044419_make_dungeon_bonus_answers_idempotent.sql", import.meta.url), "utf8");
    await db.exec(migration);
    const result = await db.query<{ count: number }>("select count(*)::int as count from public.quiz_attempts");
    assert.equal(result.rows[0].count, 1);
    await assert.rejects(
      db.query("insert into public.quiz_attempts(source,dungeon_run_id,question_id,is_correct,choice_index) values ('dungeon_bonus',$1,10,true,1)", [runId]),
      /unique/i,
    );
  } finally {
    await db.close();
  }
});
