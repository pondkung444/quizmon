import test from "node:test";
import assert from "node:assert/strict";
import {
  addChapters,
  availableBands,
  averageStat,
  buildConfig,
  chaptersOfGroup,
  groupByLevel,
  groupKey,
  splitMembers,
  subjectGroups,
  timingProblems,
  DEFAULT_TIMINGS,
  MAX_CHAPTERS,
  type ChapterRow,
} from "../../src/lib/teamBattle/scope.ts";
import type { SetupMember } from "../../src/lib/teamBattle/types.ts";

const row = (o: Partial<ChapterRow>): ChapterRow => ({
  id: 1,
  grade_band: "junior",
  grade_level: "ม.1",
  grade_order: 1,
  subject: "math",
  branch: null,
  subject_label: "คณิตศาสตร์",
  chapter: "c",
  chapter_order: 1,
  question_count: 60,
  is_available: true,
  ...o,
});
const rows: ChapterRow[] = [
  row({ id: 1, chapter: "ม1-ข", chapter_order: 2 }),
  row({ id: 2, chapter: "ม1-ก", chapter_order: 1 }),
  row({ id: 3, chapter: "ม2-ก", grade_level: "ม.2", grade_order: 2, chapter_order: 1 }),
  row({
    id: 4,
    chapter: "ฟิสิกส์-ก",
    grade_band: "senior",
    subject: "math",
    branch: "physics",
    subject_label: "ฟิสิกส์",
    grade_level: "ม.4",
    grade_order: 4,
  }),
  row({
    id: 5,
    chapter: "ป4-ก",
    grade_band: "primary",
    grade_level: "ป.4",
    grade_order: 4,
    question_count: 10,
    is_available: false,
  }),
];

test("scope: bands ครบและ primary ไม่ถูกซ่อน", () => {
  assert.deepEqual(availableBands(rows), ["primary", "junior", "senior"]);
});

test("scope: 1 ชุด = (band, subject, branch); math/physics แยกจาก math ปกติ", () => {
  assert.equal(groupKey(rows[0]), "junior|math|");
  assert.equal(groupKey(rows[3]), "senior|math|physics");
  assert.equal(subjectGroups(rows, "junior").length, 1);
  assert.equal(subjectGroups(rows, "senior")[0].label, "ฟิสิกส์");
});

test("scope: เรียงตาม grade_order แล้ว chapter_order และจัดกลุ่มตามระดับ", () => {
  const ch = chaptersOfGroup(rows, "junior|math|");
  assert.deepEqual(
    ch.map((c) => c.chapter),
    ["ม1-ก", "ม1-ข", "ม2-ก"]
  );
  assert.deepEqual(
    groupByLevel(ch).map((g) => [g.level, g.rows.length]),
    [
      ["ม.1", 2],
      ["ม.2", 1],
    ]
  );
});

test("scope: เพดาน 30 บท — เลือกทั้งหมดไม่เกิน", () => {
  const many = Array.from({ length: 40 }, (_, i) => `ch${i}`);
  const r = addChapters([], many);
  assert.equal(r.next.length, MAX_CHAPTERS);
  assert.equal(r.truncated, true);
  const r2 = addChapters(["ch0"], ["ch0", "ch1"]);
  assert.deepEqual(r2.next, ["ch0", "ch1"]);
  assert.equal(r2.truncated, false);
});

test("scope: timing ช่วงตาม DB", () => {
  assert.deepEqual(timingProblems(DEFAULT_TIMINGS), []);
  assert.equal(timingProblems({ ...DEFAULT_TIMINGS, pick_seconds: 4 }).length, 1);
  assert.equal(timingProblems({ ...DEFAULT_TIMINGS, answer_seconds: 121 }).length, 1);
  assert.equal(timingProblems({ ...DEFAULT_TIMINGS, time_limit_minutes: 2.5 }).length, 1);
});

test("scope: config ไม่มี rewards_enabled/eggs_enabled", () => {
  const cfg = buildConfig({
    band: "junior",
    group: { subject: "math", branch: null },
    chapters: ["x"],
    timings: DEFAULT_TIMINGS,
  });
  assert.equal(cfg.branch, null);
  assert.ok(!("rewards_enabled" in cfg) && !("eggs_enabled" in cfg));
  assert.equal(cfg.pick_seconds, 15);
});

const mem = (id: string, team: "a" | "b", is_player: boolean, hp: number): SetupMember => ({
  user_id: id,
  username: id,
  display_name: null,
  student_number: null,
  profile_grade_band: "junior",
  team,
  is_player,
  stat: { hp, atk: hp, def: hp, spd: hp, foc: hp },
  power: hp * 5,
  pet_nickname: null,
  pet_stage: 1,
  pet_sprite_prefix: null,
});

test("scope: แยกทีม/ผู้ชม และ stat เฉลี่ยนับเฉพาะผู้เล่น", () => {
  const ms = [mem("1", "a", true, 100), mem("2", "a", true, 51), mem("3", "a", false, 999), mem("4", "b", true, 70)];
  const s = splitMembers(ms);
  assert.deepEqual([s.a.length, s.b.length, s.spectators.length], [2, 1, 1]);
  assert.equal(averageStat(ms, "a")?.hp, 76); // (100+51)/2 = 75.5 → 76
  assert.equal(averageStat(ms, "b")?.hp, 70);
  assert.equal(averageStat([mem("5", "a", false, 5)], "a"), null);
});
