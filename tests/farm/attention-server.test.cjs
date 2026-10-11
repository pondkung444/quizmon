/* eslint-disable @typescript-eslint/no-require-imports -- Privileged boundary mock; never sends FCM. */
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
let user = { id: "verified" },
  calls = [],
  quiet = false,
  dispatches = [];
const db = {
  rpc: async (name, args) => {
    calls.push({ name, args });
    return {
      data:
        name === "farm_notification_recipients"
          ? [
              {
                user_id: "owner",
                device_id: "device",
                token: "fake",
                platform: "android",
              },
            ]
          : false,
      error: null,
    };
  },
};
function compile(file, stubs) {
  const absolute = path.resolve(file),
    m = new Module(absolute, module);
  m.filename = absolute;
  m.paths = Module._nodeModulePaths(path.dirname(absolute));
  m.require = (n) => (n in stubs ? stubs[n] : require(n));
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    absolute,
  );
  return m.exports;
}
const api = compile("src/lib/farm/attention-server.ts", {
  "server-only": {},
  "@/lib/supabase/server": { getUser: async () => user },
  "@/lib/supabase/admin": { createAdminClient: () => db },
});
const push = compile("src/lib/push/farmAttention.ts", {
  "@/lib/supabase/admin": { createAdminClient: () => db },
  "./quietHours": { isWithinQuietHours: () => quiet },
  "./dispatchNotifications": {
    dispatchNotifications: async (...args) => {
      dispatches.push(args);
      return { devicesSent: 0 };
    },
  },
});
test("attention and opt-in always derive authenticated owner; signed-out cannot write", async () => {
  calls = [];
  await api.loadFarmAttention();
  await api.farmNotificationPreference(true);
  assert.deepEqual(
    calls.map((c) => c.args.p_user),
    ["verified", "verified"],
  );
  user = null;
  assert.equal(await api.loadFarmAttention(), null);
  await assert.rejects(api.farmNotificationPreference(true));
  user = { id: "verified" };
  calls = [];
  await assert.rejects(api.farmNotificationPreference("yes"));
  assert.equal(calls.length, 0);
});
test("farm dispatch respects quiet hours and uses shared Thai-day idempotency type and one device", async () => {
  quiet = true;
  calls = [];
  assert.deepEqual(await push.dispatchFarmAttention(db), {
    skipped: "quiet-hours",
  });
  assert.equal(calls.length, 0);
  quiet = false;
  await push.dispatchFarmAttention(db);
  const [, type, recipients, message] = dispatches.at(-1);
  assert.equal(type, "farm_attention");
  assert.equal(recipients[0].devices.length, 1);
  assert.equal(message().deepLink, "/collection");
  assert.equal(message().body.includes("กำลังใจ"), true);
});
test("farm notification failures remain isolated from existing cron response", async () => {
  assert.deepEqual(
    await push.safeDispatchFarmAttention({
      rpc: async () => ({ error: { code: "bad" } }),
    }),
    { error: "farm-notification-failed" },
  );
  assert.deepEqual(
    await push.safeDispatchFarmAttention({
      rpc: async () => ({ error: { code: "PGRST202" } }),
    }),
    { skipped: "not-installed" },
  );
});
