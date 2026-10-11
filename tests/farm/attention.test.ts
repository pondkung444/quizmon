import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasFarmAttention,
  type FarmAttention,
} from "../../src/lib/farm/attention.ts";
const base: FarmAttention = {
  help: 0,
  place: 0,
  unread: 0,
  nextAt: null,
  serverNow: "2026-10-12T00:00:00Z",
};
test("badge uses server anchor rather than a wrong device date", () => {
  const v = { ...base, nextAt: "2026-10-12T00:00:10Z" };
  assert.equal(hasFarmAttention(v, 9999), false);
  assert.equal(hasFarmAttention(v, 10000), true);
  assert.equal(hasFarmAttention(v, -1000), false);
});
test("help, placement and grouped unread attention each show a badge", () => {
  for (const key of ["help", "place", "unread"])
    assert.equal(hasFarmAttention({ ...base, [key]: 1 }), true);
  assert.equal(hasFarmAttention(base), false);
  assert.equal(hasFarmAttention(null), false);
});

import { isWithinQuietHours } from "../../src/lib/push/quietHours.ts";
test("existing weekday and weekend Thai quiet-hour boundaries remain unchanged", () => {
  for (const [time, quiet] of [
    ["2026-10-12T00:00:00Z", false],
    ["2026-10-11T00:00:00Z", true],
    ["2026-10-11T02:00:00Z", false],
    ["2026-10-12T14:00:00Z", true],
    ["2026-10-12T13:59:59Z", false],
  ] as const)
    assert.equal(isWithinQuietHours(new Date(time)), quiet);
});
