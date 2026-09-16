import test from "node:test";
import assert from "node:assert/strict";
import { createLearningFeedback } from "../../src/lib/learningFeedback.ts";

test("shared learning feedback keeps both the selected and correct answer", () => {
  assert.deepEqual(createLearningFeedback(1, 2, "เพราะ 3 × 4 = 12"), {
    selectedIndex: 1,
    correctIndex: 2,
    correct: false,
    explanation: "เพราะ 3 × 4 = 12",
  });
});

test("shared learning feedback derives correctness from canonical indexes", () => {
  assert.equal(createLearningFeedback(3, 3, null).correct, true);
});
