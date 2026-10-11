/* eslint-disable @typescript-eslint/no-require-imports -- Isolated privileged RPC authorization checks. */
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
let user = { id: "verified-owner" },
  calls = [];
const db = {
  rpc: async (name, args) => {
    calls.push({ name, args });
    return {
      data:
        name === "farm_visit_snapshot"
          ? { sentToday: true, remainingToday: 9 }
          : name === "farm_visit_preference"
            ? false
            : name === "farm_sticker_inbox"
              ? []
              : { created: true, id: "sticker", day: "2026-10-12" },
      error: null,
    };
  },
  from: () => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    limit: async () => ({ data: [], error: null }),
  }),
};
const file = path.resolve("src/lib/farm/social-server.ts"),
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
        : name === "./social"
          ? {
              FARM_STICKERS: [
                { id: "star" },
                { id: "heart" },
                { id: "clap" },
                { id: "flower" },
                { id: "water" },
                { id: "moon" },
              ],
            }
          : require(name);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  file,
);
const api = loaded.exports,
  target = "00000000-0000-4000-8000-000000000123",
  nonce = "00000000-0000-4000-8000-000000000456";
test("social endpoints authenticate before any privileged read or command", async () => {
  user = null;
  calls = [];
  for (const f of [
    () => api.loadFriendFarm(target),
    () => api.sendFarmSticker(target, "star", nonce),
    () => api.visitPreference(false),
    () => api.farmStickerInbox(true),
  ])
    await assert.rejects(f(), /เข้าสู่ระบบ/);
  assert.equal(calls.length, 0);
  user = { id: "verified-owner" };
});
test("visitor, sender and settings owner are derived from auth, never supplied by client", async () => {
  calls = [];
  await api.sendFarmSticker(target, "star", nonce, { userId: "attacker" });
  assert.deepEqual(calls[0], {
    name: "farm_sticker_send",
    args: {
      p_sender: "verified-owner",
      p_recipient: target,
      p_sticker: "star",
      p_request: nonce,
    },
  });
  assert.deepEqual(calls[1], {
    name: "farm_visit_snapshot",
    args: { p_viewer: "verified-owner", p_owner: target },
  });
  await api.visitPreference(false);
  assert.deepEqual(calls[2].args, {
    p_user: "verified-owner",
    p_enabled: false,
  });
  await api.farmStickerInbox(true);
  assert.deepEqual(calls[3].args, {
    p_user: "verified-owner",
    p_mark_read: true,
  });
  assert.equal(
    calls.some((c) => /wallet|project_command|checkpoint|exp/.test(c.name)),
    false,
  );
});
test("free text, malformed IDs, and non-boolean preferences never invoke a command", async () => {
  calls = [];
  await assert.rejects(api.sendFarmSticker(target, "free text", nonce));
  await assert.rejects(api.sendFarmSticker("bad", "star", nonce));
  await assert.rejects(api.sendFarmSticker(target, "star", "bad"));
  await assert.rejects(api.visitPreference("true"));
  await assert.rejects(api.farmStickerInbox("true"));
  assert.equal(calls.length, 0);
});
