/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server module loader for authorization tests. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const id = "00000000-0000-4000-8000-000000000003",
  sessionId = "00000000-0000-4000-8000-000000000004",
  requestId = "00000000-0000-4000-8000-000000000005";
let user = { id: "session-owner" },
  calls = [],
  previous = null;
const cache = new Map();
const db = {
  from(table) {
    calls.push({ table });
    const chain = {
      select() {
        return chain;
      },
      lt() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      eq(key, value) {
        calls.push({ table, key, value });
        return chain;
      },
      async single() {
        return {
          data:
            table === "farm_projects"
              ? { id, checkpoint: 0, rules_snapshot: { place: "pond" } }
              : {
                  session_id: sessionId,
                  puzzle: engine.generatePuzzle("pond", 17445),
                },
          error: null,
        };
      },
      async maybeSingle() {
        return {
          data: table === "farm_puzzle_submissions" ? previous : null,
          error: null,
        };
      },
    };
    return chain;
  },
  async rpc(name, args) {
    calls.push({ name, args });
    return {
      data:
        name === "farm_puzzle_open"
          ? {
              session: {
                session_id: sessionId,
                puzzle: args.p_puzzle,
                draft: null,
                draft_revision: 0,
              },
              project: { id },
            }
          : name === "farm_lesson_open"
            ? {
                session_id: sessionId,
                puzzle: args.p_puzzle,
                draft: null,
                draft_revision: 0,
              }
            : { passed: false, project: { id }, revision: 1, saved: true },
      error: null,
    };
  },
};
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  cache.set(file, loaded);
  loaded.require = (name) =>
    name === "server-only"
      ? {}
      : name === "@/lib/supabase/server"
        ? { getUser: async () => user }
        : name === "@/lib/supabase/admin"
          ? { createAdminClient: () => db }
          : name.startsWith(".")
            ? load(
                path.resolve(
                  path.dirname(file),
                  name.endsWith(".ts") ? name : name + ".ts",
                ),
              )
            : require(name);
  loaded._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    file,
  );
  return loaded.exports;
}
const engine = load("src/lib/farm/puzzle-engine.ts"),
  api = load("src/lib/farm/puzzle-server.ts"),
  lesson = load("src/lib/farm/lesson-server.ts");
test("puzzle and lesson endpoints authenticate before privileged reads", async () => {
  user = null;
  calls = [];
  for (const fn of [
    () => api.openProjectPuzzle(id),
    () =>
      api.submitProjectPuzzle(id, sessionId, "2030-01-01", requestId, {
        tiles: [],
      }),
    () => api.saveProjectDraft(id, sessionId, 0, { tiles: [] }),
    () => api.hintProjectPuzzle(id, sessionId, {}, 1),
    () => lesson.openSubjectLesson("pond", id),
    () => lesson.answerSubjectLesson(sessionId, 0, {}, true),
    () => lesson.hintSubjectLesson(sessionId, {}, 1),
  ])
    await assert.rejects(fn(), /เข้าสู่ระบบ/);
  assert.equal(calls.length, 0);
  user = { id: "session-owner" };
});
test("trusted server derives owner and validates answers instead of accepting passed", async () => {
  calls = [];
  await api.submitProjectPuzzle(id, sessionId, "2030-01-01", requestId, {
    tiles: [],
    passed: true,
    user_id: "attacker",
  });
  assert.ok(
    calls.some(
      (x) =>
        x.table === "farm_projects" &&
        x.key === "user_id" &&
        x.value === "session-owner",
    ),
  );
  const call = calls.find((x) => x.name === "farm_puzzle_submit");
  assert.equal(call.args.p_user, "session-owner");
  assert.equal(call.args.p_passed, false);
});
test("retry of a completed checkpoint returns its stored response", async () => {
  previous = {
    session_id: sessionId,
    response: { passed: true, project: { id, checkpoint: 1 } },
  };
  calls = [];
  const r = await api.submitProjectPuzzle(
    id,
    sessionId,
    "2030-01-01",
    requestId,
    { tiles: [] },
  );
  assert.equal(r.passed, true);
  assert.ok(
    !calls.some((x) => x.table === "farm_project_checkpoints" || x.name),
  );
  previous = null;
});
test("malformed drafts never invoke a checkpoint completion RPC", async () => {
  calls = [];
  await assert.rejects(
    api.submitProjectPuzzle(id, sessionId, "2030-01-01", requestId, {
      tiles: [null],
    }),
    /คำตอบ/,
  );
  assert.ok(!calls.some((x) => x.name));
});

test("opening projects and lessons sends only public puzzle views", async () => {
  calls = [];
  const p = await api.openProjectPuzzle(id);
  const l = await lesson.openSubjectLesson("pond", id);
  for (const result of [p, l]) {
    const json = JSON.stringify(result.puzzle);
    assert.ok(!json.includes('"seed"'));
    assert.ok(!json.includes('"solution"'));
    assert.equal(result.sessionId, sessionId);
  }
  assert.ok(
    calls.filter((x) => x.name).every((x) => x.args.p_user === "session-owner"),
  );
});
