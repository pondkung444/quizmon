import assert from "node:assert/strict";

import { projectFactoryOffice } from "../src/lib/questionFactory/officeProjection.ts";

const checkpoints = [
  {
    input: { runStatus: "running", slotState: "author_revision", latestEventType: "QUESTION_QC_REVISE" },
    expected: { "question-author": "receive_work", "question-qc": "revision", "factory-manager": "monitoring" },
  },
  {
    input: { runStatus: "running", slotState: "asset_build", latestEventType: "ASSET_QC_REGENERATE" },
    expected: { "image-builder": "revision", "image-qc": "revision", "factory-manager": "monitoring" },
  },
  {
    input: { runStatus: "running", slotState: "pending_human_review", latestEventType: "ASSET_QC_PASS" },
    expected: { publisher: "receive_work", "image-qc": "success" },
  },
  {
    input: { runStatus: "running", slotState: "approved", latestEventType: "ASSET_PROMOTED" },
    expected: { publisher: "final_check", "factory-manager": "monitoring" },
  },
  {
    input: { runStatus: "running", slotState: "active", latestEventType: "QUESTION_ACTIVATED" },
    expected: { publisher: "success", "factory-manager": "success" },
  },
];

for (const checkpoint of checkpoints) {
  const first = projectFactoryOffice(checkpoint.input);
  const reconstructed = projectFactoryOffice(structuredClone(checkpoint.input));
  assert.deepEqual(reconstructed, first, "Office projection must be deterministic after reconnect");
  const byRole = Object.fromEntries(first.map(({ role, action }) => [role, action]));
  for (const [role, action] of Object.entries(checkpoint.expected)) {
    assert.equal(byRole[role], action, `${checkpoint.input.latestEventType}: ${role}`);
  }
}

console.log(JSON.stringify({ checkpoints: checkpoints.length, deterministic: true }, null, 2));
