import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gradeBandOf,
  isGradeLevel,
  leaderboardBandOf,
  leaderboardBucketOf,
  normalizeGradeBand,
  visibleGradeLevels,
  SELECTABLE_GRADE_LEVELS,
} from "../../src/lib/gradeLevel.ts";

test("gradeBandOf: ป.→primary, ม.1-3→junior, ม.4-6→senior", () => {
  for (const l of ["ป.4", "ป.5", "ป.6"] as const) assert.equal(gradeBandOf(l), "primary");
  for (const l of ["ม.1", "ม.2", "ม.3"] as const) assert.equal(gradeBandOf(l), "junior");
  for (const l of ["ม.4", "ม.5", "ม.6"] as const) assert.equal(gradeBandOf(l), "senior");
});

test("visibleGradeLevels: junior ไม่เปลี่ยนจากเดิม", () => {
  assert.deepEqual(visibleGradeLevels("junior", "ม.1"), ["ม.1"]);
  assert.deepEqual(visibleGradeLevels("junior", "ม.2"), ["ม.1", "ม.2"]);
  assert.deepEqual(visibleGradeLevels("junior", "ม.3"), ["ม.1", "ม.2", "ม.3"]);
});

test("visibleGradeLevels: primary เห็นเฉพาะกลุ่ม ป. ไม่ข้ามไป ม.", () => {
  assert.deepEqual(visibleGradeLevels("primary", "ป.4"), ["ป.4"]);
  assert.deepEqual(visibleGradeLevels("primary", "ป.5"), ["ป.4", "ป.5"]);
  assert.deepEqual(visibleGradeLevels("primary", "ป.6"), ["ป.4", "ป.5", "ป.6"]);
});

test("visibleGradeLevels: senior / ไม่มีชั้น / ไม่รู้จัก / ชั้นไม่ตรง band → null (ไม่กรอง)", () => {
  assert.equal(visibleGradeLevels("senior", "ม.5"), null);
  assert.equal(visibleGradeLevels("junior", null), null);
  assert.equal(visibleGradeLevels("primary", undefined), null);
  assert.equal(visibleGradeLevels("junior", "ป.5"), null);
  assert.equal(visibleGradeLevels("primary", "ม.1"), null);
  assert.equal(visibleGradeLevels("junior", "x"), null);
});

test("leaderboardBandOf: primary รวมเข้า junior", () => {
  assert.equal(leaderboardBandOf("primary"), "junior");
  assert.equal(leaderboardBandOf("junior"), "junior");
  assert.equal(leaderboardBandOf("senior"), "senior");
});

test("leaderboardBucketOf / normalizeGradeBand: ค่าแปลก → null", () => {
  assert.equal(leaderboardBucketOf("primary"), "junior");
  assert.equal(leaderboardBucketOf("senior"), "senior");
  assert.equal(leaderboardBucketOf("weird"), null);
  assert.equal(leaderboardBucketOf(null), null);
  assert.equal(normalizeGradeBand("primary"), "primary");
  assert.equal(normalizeGradeBand(undefined), null);
});

test("isGradeLevel: ผู้ใช้เลือก ป.x ไม่ได้", () => {
  assert.equal(isGradeLevel("ม.1"), true);
  assert.equal(isGradeLevel("ป.5"), false);
  assert.deepEqual([...SELECTABLE_GRADE_LEVELS], ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"]);
});
