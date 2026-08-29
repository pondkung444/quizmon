import assert from "node:assert/strict";

import { evaluateFactoryOperationalHealth } from "../src/lib/questionFactory/operationalHealth.ts";

const nowMs = Date.parse("2026-08-29T06:00:00.000Z");
const recent = "2026-08-29T05:55:00.000Z";

function slot(state, overrides = {}) {
  return { state, authorRevision: 0, technicalRetryCount: 0, updatedAt: recent, ...overrides };
}

function run(overrides = {}) {
  return { status: "running", targetActive: 2, activeCount: 2, pipelineReadyCount: 0, lastError: null, ...overrides };
}

const completed = evaluateFactoryOperationalHealth({
  run: run({ status: "completed" }),
  slots: [slot("active"), slot("active")],
  latestEventAt: recent,
  nowMs,
});
assert.equal(completed.severity, "healthy");
assert.equal(completed.completionReadiness, "completed");
assert.equal(completed.nonterminalSlotCount, 0);

const ready = evaluateFactoryOperationalHealth({
  run: run(),
  slots: [slot("active"), slot("active")],
  latestEventAt: recent,
  nowMs,
});
assert.equal(ready.completionReadiness, "ready");

const drift = evaluateFactoryOperationalHealth({
  run: run({ activeCount: 1 }),
  slots: [slot("active"), slot("active")],
  latestEventAt: recent,
  nowMs,
});
assert.equal(drift.severity, "critical");
assert.equal(drift.counterDrift, true);
assert.equal(drift.issues[0].code, "counter_drift");

const staleReview = evaluateFactoryOperationalHealth({
  run: run({ targetActive: 1, activeCount: 0 }),
  slots: [slot("pending_human_review", { updatedAt: "2026-08-28T04:00:00.000Z" })],
  latestEventAt: "2026-08-28T04:00:00.000Z",
  nowMs,
});
assert.equal(staleReview.severity, "attention");
assert.equal(staleReview.staleSlotCount, 1);
assert.equal(staleReview.bottleneck?.state, "pending_human_review");

const blocked = evaluateFactoryOperationalHealth({
  run: run({ targetActive: 1, activeCount: 0 }),
  slots: [slot("blocked", { technicalRetryCount: 2 })],
  latestEventAt: recent,
  nowMs,
});
assert.equal(blocked.severity, "critical");
assert.equal(blocked.blockedSlotCount, 1);
assert.equal(blocked.retryPressureCount, 1);

console.log("Question Factory operational health verification passed");
