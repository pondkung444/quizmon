import assert from "node:assert/strict";
import test from "node:test";
import { parseShareSource, pickShareMoment, shareLink } from "../../src/lib/share/shareMoment.ts";

const base = { evolved: false, fromStage: 3, toStage: 3, correctInRound: 3, questionCount: 5 };

test("picks hatch, evolve, perfect in priority order", () => {
  assert.equal(pickShareMoment({ ...base, evolved: true, fromStage: 1, toStage: 2, correctInRound: 5 }), "hatch");
  assert.equal(pickShareMoment({ ...base, evolved: true, fromStage: 2, toStage: 3, correctInRound: 5 }), "evolve");
  assert.equal(pickShareMoment({ ...base, correctInRound: 5 }), "perfect");
});

test("3→4 alone and imperfect rounds have no moment", () => {
  assert.equal(pickShareMoment({ ...base, evolved: true, toStage: 4 }), null);
  assert.equal(pickShareMoment(base), null);
});

test("an empty round is not perfect", () => {
  assert.equal(pickShareMoment({ ...base, correctInRound: 0, questionCount: 0 }), null);
});

test("hatch needs evolved, not just the stage numbers", () => {
  assert.equal(pickShareMoment({ ...base, evolved: false, fromStage: 1, toStage: 2 }), null);
});

test("link carries only the moment source", () => {
  assert.equal(shareLink("hatch"), "https://quizmon.xyz/?src=share_hatch");
});

test("only known sources are accepted", () => {
  assert.equal(parseShareSource("?src=share_evolve"), "share_evolve");
  assert.equal(parseShareSource("?src=anything"), null);
  assert.equal(parseShareSource(""), null);
});
