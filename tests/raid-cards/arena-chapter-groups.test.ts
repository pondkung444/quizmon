import test from "node:test";
import assert from "node:assert/strict";
import { changedFromAuto, groupRaidChapters, toggleRaidChapter, MIXED_GROUP_TITLE, type RaidChapter } from "../../src/components/raid/arena/chapters.ts";

const ch = (key: string, gradeLevel: string | null, own = false): RaidChapter =>
  ({ key, chapter: key, subject: "math", subjectLabel: "คณิตศาสตร์", gradeLevel, questionCount: 20, ownGrade: own });

test("own grade first, other grades in order, no-grade chapters last", () => {
  // RPC order as on prod: own grade first, then grade_order where the no-grade rows have 0.
  const groups = groupRaidChapters({
    gradeLevel: "ม.2",
    auto: [],
    chapters: [ch("a", "ม.2", true), ch("stats", null), ch("atom", null), ch("b", "ม.1"), ch("c", "ม.3"), ch("d", "ม.1")],
  });
  assert.deepEqual(groups.map((g) => g.title), ["ม.2 ชั้นของเรา", "ม.1", "ม.3", MIXED_GROUP_TITLE]);
  assert.deepEqual(groups[1].chapters.map((c) => c.key), ["b", "d"]);
  assert.deepEqual(groups[3].chapters.map((c) => c.key), ["stats", "atom"]);
});

test("no-grade chapters stay last even when the RPC flags them as own grade", () => {
  const groups = groupRaidChapters({ gradeLevel: null, auto: [], chapters: [ch("x", null, true), ch("b", "ม.1")] });
  assert.deepEqual(groups.map((g) => g.title), ["ม.1", MIXED_GROUP_TITLE]);
});

test("picking caps at 3 and emptying goes back to auto", () => {
  let s = toggleRaidChapter({ auto: true, keys: [] }, "a");
  assert.deepEqual(s, { auto: false, keys: ["a"] });
  s = toggleRaidChapter(toggleRaidChapter(s, "b"), "c");
  assert.deepEqual(toggleRaidChapter(s, "d"), s);
  s = toggleRaidChapter(toggleRaidChapter(toggleRaidChapter(s, "a"), "b"), "c");
  assert.deepEqual(s, { auto: true, keys: [] });
});

test("changedFromAuto ignores order and auto mode", () => {
  assert.equal(changedFromAuto(["a", "b"], { auto: true, keys: [] }), false);
  assert.equal(changedFromAuto(["a", "b"], { auto: false, keys: ["b", "a"] }), false);
  assert.equal(changedFromAuto(["a", "b"], { auto: false, keys: ["a"] }), true);
});
