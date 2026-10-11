/* eslint-disable @typescript-eslint/no-require-imports -- Authorization test with isolated server dependencies. */
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
let user = { id: "owner" },
  calls = [];
const db = {
  rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: [], error: null };
  },
};
const file = path.resolve("src/lib/farm/layout-server.ts"),
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
        : name === "./world"
          ? { INITIAL_FARM: [] }
          : require(name);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  file,
);
const api = loaded.exports;
test("layout reads and writes authenticate before privileged RPC", async () => {
  user = null;
  calls = [];
  await assert.rejects(api.loadFarmLayout(), /เข้าสู่ระบบ/);
  await assert.rejects(
    api.changeFarmLayout("move", "home-meadow", 0, 0),
    /เข้าสู่ระบบ/,
  );
  assert.equal(calls.length, 0);
  user = { id: "owner" };
});
test("layout commands derive owner and preserve orientation instead of accepting a supplied owner", async () => {
  calls = [];
  await api.changeFarmLayout("move", "home-meadow", 0, -1, 0, {
    userId: "attacker",
  });
  assert.deepEqual(calls[0], {
    name: "farm_layout_move",
    args: {
      p_user: "owner",
      p_id: "home-meadow",
      p_x: 0,
      p_y: -1,
      p_orientation: 0,
    },
  });
});
test("invalid operation, coordinates, UUID and bridge direction never reach SQL", async () => {
  calls = [];
  for (const args of [
    ["sell", "home-meadow", 0, 0],
    ["move", "home-meadow", 10001, 0],
    ["move", "home-meadow", 0.5, 0],
    ["move", "home-meadow", 0, 0, 2],
    ["place", "foreign", 0, 0],
  ])
    await assert.rejects(api.changeFarmLayout(...args));
  assert.equal(calls.length, 0);
});
