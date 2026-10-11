/* eslint-disable @typescript-eslint/no-require-imports -- Isolated authorization and projection tests. */
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
let user = { id: "owner" },
  calls = [],
  rows = {};
const db = {
  from(table) {
    const query = { table, filters: [] };
    calls.push(query);
    const chain = {
      select(fields) {
        query.fields = fields;
        return chain;
      },
      eq(key, value) {
        query.filters.push([key, value]);
        return chain;
      },
      in(key, value) {
        query.filters.push([key, value]);
        return chain;
      },
      order() {
        return chain;
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[table] ?? null, error: null });
      },
      then(resolve, reject) {
        return Promise.resolve({ data: rows[table] ?? [], error: null }).then(
          resolve,
          reject,
        );
      },
    };
    return chain;
  },
};
const file = path.resolve("src/lib/farm/history-server.ts"),
  loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded.require = (name) =>
  name === "server-only"
    ? {}
    : name === "@/lib/supabase/server"
      ? { getUser: async () => user }
      : name === "@/lib/supabase/admin"
        ? { createAdminClient: () => db }
        : name === "./school-server"
          ? { loadSchoolPets: async () => [{ id: "pet", name: "คู่หูเดิม" }] }
          : name === "./school-art"
            ? { schoolArt: (level) => "school-" + level }
            : name === "./catalogue-gates"
              ? { PLACE_ART: { pond: "pond" } }
              : require(name);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  file,
);
const api = loaded.exports,
  id = "00000000-0000-4000-8000-000000000111";
test("history authenticates before reading and invalid IDs never query", async () => {
  user = null;
  calls = [];
  await assert.rejects(api.loadPlaceHistory(id), /เข้าสู่ระบบ/);
  assert.equal(calls.length, 0);
  user = { id: "owner" };
  assert.equal(await api.loadPlaceHistory("attacker"), null);
  assert.equal(calls.length, 0);
});
test("history derives owner, reads only placed projects and retains past roles", async () => {
  calls = [];
  rows = {
    farm_projects: {
      id,
      rules_snapshot: { place: "pond" },
      completed_at: "2026-10-12",
    },
    farm_project_contributions: [
      {
        pet_id: "pet",
        role: "leader",
        joined_at: "2026-10-01",
        left_at: "2026-10-02",
      },
      {
        pet_id: "pet",
        role: "helper",
        joined_at: "2026-10-03",
        left_at: "2026-10-04",
      },
      {
        pet_id: null,
        role: "leader",
        joined_at: "2026-10-05",
        left_at: "2026-10-06",
      },
    ],
  };
  const h = await api.loadPlaceHistory(id, { userId: "attacker" });
  assert.deepEqual(calls[0].filters, [
    ["user_id", "owner"],
    ["id", id],
    ["status", "placed"],
  ]);
  assert.deepEqual(calls[1].filters, [["project_id", [id]]]);
  assert.equal(h.contributors.length, 3);
  assert.equal(h.contributors[0].name, "คู่หูเดิม");
  assert.equal(h.contributors[2].name, "Qmon ที่เคยร่วมงาน");
  assert.equal(JSON.stringify(h).includes("rules_snapshot"), false);
  assert.equal(
    calls.some(
      (c) => c.table.includes("checkpoint") || c.table.includes("wallet"),
    ),
    false,
  );
});
test("foreign or unfinished IDs return no history or contributor reads", async () => {
  rows = {};
  calls = [];
  assert.equal(await api.loadPlaceHistory(id), null);
  assert.equal(
    calls.some((c) => c.table === "farm_project_contributions"),
    false,
  );
  for (const q of calls)
    assert.ok(q.filters.some(([k, v]) => k === "user_id" && v === "owner"));
});
