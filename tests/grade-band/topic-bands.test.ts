import { test } from "node:test";
import assert from "node:assert/strict";
import { isTopicBandAllowed, topicBandsFor } from "../../src/lib/gradeLevel.ts";

test("topicBandsFor: primary เห็นเฉพาะ primary", () => {
  assert.deepEqual(topicBandsFor("primary"), ["primary"]);
});

test("topicBandsFor: junior/senior เห็น junior+senior (cross-grade ม.↔ม.) และไม่เห็น primary", () => {
  assert.deepEqual(topicBandsFor("junior"), ["junior", "senior"]);
  assert.deepEqual(topicBandsFor("senior"), ["junior", "senior"]);
  assert.ok(!topicBandsFor("junior").includes("primary"));
  assert.ok(!topicBandsFor("senior").includes("primary"));
});

test("topicBandsFor: ค่าแปลก → [] ไม่ตกเป็น junior เงียบๆ", () => {
  for (const v of [null, undefined, "", "Primary", "elementary", 4, {}]) {
    assert.deepEqual(topicBandsFor(v), []);
  }
});

test("isTopicBandAllowed: ข้ามฝั่ง primary/ไม่ใช่ primary ไม่ได้ทั้งสองทิศ", () => {
  assert.equal(isTopicBandAllowed("primary", "primary"), true);
  assert.equal(isTopicBandAllowed("primary", "junior"), false);
  assert.equal(isTopicBandAllowed("primary", "senior"), false);
  assert.equal(isTopicBandAllowed("junior", "primary"), false);
  assert.equal(isTopicBandAllowed("senior", "primary"), false);
});

test("isTopicBandAllowed: junior/senior ข้ามกันได้ตามเดิม", () => {
  for (const u of ["junior", "senior"]) {
    for (const t of ["junior", "senior"]) assert.equal(isTopicBandAllowed(u, t), true);
  }
});

test("isTopicBandAllowed: band ของผู้เล่นหรือของบทไม่รู้จัก → false", () => {
  assert.equal(isTopicBandAllowed("elementary", "junior"), false);
  assert.equal(isTopicBandAllowed(null, "junior"), false);
  assert.equal(isTopicBandAllowed("junior", "elementary"), false);
  assert.equal(isTopicBandAllowed("junior", undefined), false);
  assert.equal(isTopicBandAllowed("primary", ""), false);
});
