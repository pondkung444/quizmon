import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the real action boundaries with local service doubles: a successful
// claim must not invalidate the route and unmount its unread reward screen.
test("raid rewards invalidate routes only after explicit acknowledgement", async () => {
  const invalidations: string[] = [];
  let loggedIn = true;
  let claims = 0;
  const reward = { gear_id: "gear-1", egg_awarded: true, pity_meter: 0 };
  const client = {
    auth: { getUser: async () => ({ data: { user: loggedIn ? { id: "user", is_anonymous: false } : null } }) },
    rpc: () => ({ single: async () => { claims++; return { data: reward, error: null }; } }),
  };
  const output = ts.transpileModule(readFileSync(new URL("../../src/app/raid/card-actions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, (...args: string[]) => Promise<unknown>> = {};
  runInNewContext(output, {
    exports,
    require: (name: string) => {
      if (name === "@/lib/supabase/server") return { createClient: async () => client };
      if (name === "@/lib/raid/reward") return { mapRaidReward: async (value: unknown) => value };
      if (name === "next/cache") return { revalidatePath: (path: string) => invalidations.push(path) };
      return {};
    },
  });
  const run = "00000000-0000-4000-8000-000000000001";
  assert.equal(await exports.claimRaidCardReward(run), reward);
  assert.deepEqual(invalidations, []);
  await exports.acknowledgeRaidCardReward(run);
  assert.deepEqual(invalidations, ["/raid", "/pet"]);
  assert.equal(claims, 1, "acknowledgement must not award another item");
  loggedIn = false;
  await assert.rejects(exports.acknowledgeRaidCardReward(run), /เข้าสู่ระบบ/);
  assert.equal(invalidations.length, 2);
});
