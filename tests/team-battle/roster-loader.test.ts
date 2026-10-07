import test from "node:test";
import assert from "node:assert/strict";
import { ROSTER_RETRY_MS, createRosterLoader } from "../../src/lib/teamBattle/rosterLoad.ts";

// จำลอง fetch/ตัวจับเวลา แล้วเดินลำดับ attach/start/detach เหมือน React StrictMode (dev):
// mount → effect → cleanup → mount ใหม่ → effect ซ้ำ
const tick = () => new Promise<void>((r) => setImmediate(r));

function harness(results: Array<"ok" | "fail">) {
  const calls = { fetch: 0, loaded: [] as string[] };
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const cleared: number[] = [];
  let nextId = 1;
  const loader = createRosterLoader<string>({
    fetch: async () => {
      const r = results[calls.fetch++] ?? "fail";
      if (r === "fail") throw new Error("rpc");
      return `roster${calls.fetch}`;
    },
    onLoaded: (v) => calls.loaded.push(v),
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (h) => {
      cleared.push(h as number);
      timers.delete(h as number);
    },
  });
  const fire = () => {
    const [id, t] = [...timers.entries()][0];
    timers.delete(id);
    t.fn();
  };
  return { loader, calls, timers, cleared, fire };
}

test("loader: สำเร็จครั้งแรก — ยิงครั้งเดียว ส่งผลครั้งเดียว ไม่มี retry", async () => {
  const h = harness(["ok"]);
  h.loader.attach();
  h.loader.start();
  h.loader.start(); // เรียกซ้ำไม่ยิงซ้ำ
  await tick();
  assert.equal(h.calls.fetch, 1);
  assert.deepEqual(h.calls.loaded, ["roster1"]);
  assert.equal(h.timers.size, 0);
});

test("loader: StrictMode (attach→start→detach→attach→start) ผลของ request แรกยังถูกใช้ ไม่ยิงซ้ำ", async () => {
  const h = harness(["ok"]);
  h.loader.attach(); // mount รอบแรก
  h.loader.start();
  h.loader.detach(); // cleanup ที่ dev จำลอง
  h.loader.attach(); // mount รอบสอง
  h.loader.start(); // effect รอบสอง — ต้องไม่ยิงซ้ำ
  await tick();
  assert.equal(h.calls.fetch, 1);
  assert.deepEqual(h.calls.loaded, ["roster1"]);
});

test("loader: ล้มเหลวครั้งแรกแล้วสำเร็จตอน retry (รอ 3 วิ)", async () => {
  const h = harness(["fail", "ok"]);
  h.loader.attach();
  h.loader.start();
  await tick();
  assert.equal(h.calls.fetch, 1);
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, ROSTER_RETRY_MS);
  assert.deepEqual(h.calls.loaded, []);
  h.fire();
  await tick();
  assert.equal(h.calls.fetch, 2);
  assert.deepEqual(h.calls.loaded, ["roster2"]);
  assert.equal(h.timers.size, 0);
});

test("loader: StrictMode ระหว่างรอ retry — cleanup เลิกจับเวลา, mount ใหม่ตั้งใหม่ แล้ว retry สำเร็จ", async () => {
  const h = harness(["fail", "ok"]);
  h.loader.attach();
  h.loader.start();
  await tick();
  assert.equal(h.timers.size, 1);
  h.loader.detach();
  assert.equal(h.timers.size, 0); // เลิกแล้ว
  assert.equal(h.cleared.length, 1);
  h.loader.attach();
  assert.equal(h.timers.size, 1); // ตั้งใหม่
  h.fire();
  await tick();
  assert.deepEqual(h.calls.loaded, ["roster2"]);
});

test("loader: ล้มเหลวสองครั้งแล้วหยุด (ไม่ลองครั้งที่สาม ไม่มีผลเข้า component)", async () => {
  const h = harness(["fail", "fail", "ok"]);
  h.loader.attach();
  h.loader.start();
  await tick();
  h.fire();
  await tick();
  assert.equal(h.calls.fetch, 2);
  assert.equal(h.timers.size, 0); // ไม่ตั้งรอบสาม
  assert.deepEqual(h.calls.loaded, []);
  h.loader.start(); // start ซ้ำก็ไม่ยิงอีก
  h.loader.detach();
  h.loader.attach();
  await tick();
  assert.equal(h.calls.fetch, 2);
  assert.equal(h.timers.size, 0);
});

test("loader: unmount จริงระหว่างรอ retry — เลิกจับเวลา ไม่ยิงต่อ", async () => {
  const h = harness(["fail", "ok"]);
  h.loader.attach();
  h.loader.start();
  await tick();
  assert.equal(h.timers.size, 1);
  h.loader.detach(); // unmount จริง (ไม่มี attach ตามมา)
  assert.equal(h.timers.size, 0);
  await tick();
  assert.equal(h.calls.fetch, 1);
  assert.deepEqual(h.calls.loaded, []);
});

test("loader: unmount จริงขณะ request กำลังบิน — ผลไม่ถูกส่งเข้า component ที่ตายแล้ว", async () => {
  const h = harness(["ok"]);
  h.loader.attach();
  h.loader.start();
  h.loader.detach(); // ก่อน fetch เสร็จ
  await tick();
  assert.equal(h.calls.fetch, 1);
  assert.deepEqual(h.calls.loaded, []); // พักไว้ รอ attach (unmount จริงไม่มี attach มา)
  h.loader.attach(); // StrictMode จะ attach ทันที → ได้ผลที่พักไว้
  assert.deepEqual(h.calls.loaded, ["roster1"]);
});
