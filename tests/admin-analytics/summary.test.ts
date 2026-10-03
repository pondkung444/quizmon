import assert from "node:assert/strict";
import test from "node:test";
import { aggregateAnalytics, analyticsWindow, eligibleProfiles, type AnalyticsProfile, type AnalyticsAttempt } from "../../src/lib/adminAnalytics.ts";

const now = Date.parse("2026-10-03T12:00:00+07:00");
const profile = (id: string, band: string | null, school = "A"): AnalyticsProfile => ({
  id, username: id, grade_band: band, school, grade_level: null,
});
const attempt = (user_id: string | null, overrides: Partial<AnalyticsAttempt> = {}): AnalyticsAttempt => ({
  user_id, is_correct: true, created_at: "2026-10-03T01:00:00+07:00", question_id: 1, source: "pvp", ...overrides,
});

test("primary, null and unrecognized grade bands cannot crash or lose overall counts", () => {
  const profiles = [profile("p", "primary"), profile("j", "junior"), profile("s", "senior"), profile("n", null), profile("x", "future-band")];
  const result = aggregateAnalytics(profiles, profiles.map((p) => attempt(p.id)), [], now);
  assert.equal(result.summary.students, 5);
  assert.equal(result.today.students, 5);
  assert.deepEqual(result.bands.map((row) => row.students), [1, 1, 1, 2]);
  assert.equal(result.bands.reduce((sum, row) => sum + row.attempts, 0), result.summary.attempts);
});

test("Bangkok midnight and inclusive 7/14 calendar-day boundaries", () => {
  const window = analyticsWindow(now);
  assert.equal(new Date(window.summaryMs).toISOString(), "2026-09-26T17:00:00.000Z");
  assert.equal(new Date(window.detailMs).toISOString(), "2026-09-19T17:00:00.000Z");
  const at = (ts: number) => attempt("p", { created_at: new Date(ts).toISOString() });
  const result = aggregateAnalytics([profile("p", "primary")], [
    at(window.detailMs - 1), at(window.detailMs), at(window.summaryMs - 1), at(window.summaryMs),
    at(window.todayMs - 1), at(window.todayMs), at(now + 1), attempt("p", { created_at: "invalid" }),
  ], [], now);
  assert.equal(result.summary.attempts, 3);
  assert.equal(result.today.attempts, 1);
  assert.equal(result.questionsPerDay.length, 14);
  assert.equal(result.questionsPerDay.reduce((sum, day) => sum + day.total, 0), 5);
});

test("school cohort and excluded accounts apply to every section", () => {
  const profiles = [profile("a", "primary"), profile("b", "junior", "B"), profile("admin", "senior"), { ...profile("test", "junior"), username: " Dawu " }];
  const cohort = eligibleProfiles(profiles, new Set(["admin"])).filter((p) => p.school === "A");
  const result = aggregateAnalytics(cohort, profiles.map((p) => attempt(p.id)).concat(attempt(null), attempt("deleted")), [
    { id: 1, category: "fractions", grade_band: "primary" },
  ], now);
  assert.equal(result.registered, 1);
  assert.equal(result.summary.students, 1);
  assert.equal(result.summary.attempts, 1);
  assert.equal(result.modes[0].attempts, 1);
  assert.equal(result.lessons[0].attempts, 1);
  assert.equal(result.questionsPerDay.reduce((sum, day) => sum + day.total, 0), 1);
});

test("repeat practice requires distinct Thai dates, accuracy is weighted by answers", () => {
  const result = aggregateAnalytics([profile("a", "primary"), profile("b", "senior")], [
    attempt("a"), attempt("a", { is_correct: false }),
    attempt("a", { created_at: "2026-10-02T16:59:59Z", is_correct: false }),
    attempt("b"),
  ], [], now);
  assert.equal(result.repeatStudents, 1);
  assert.equal(result.repeatPct, 50);
  assert.equal(result.summary.accuracyPct, 50);
  assert.equal(result.averageQuestions, 2);
});

test("mode answers are additive, students may overlap, legacy source stays unknown", () => {
  const result = aggregateAnalytics([profile("a", "primary")], [
    attempt("a"), attempt("a", { source: "raid_boss" }), attempt("a", { source: null }),
    attempt("a", { source: "constructor" }),
  ], [], now);
  assert.equal(result.summary.students, 1);
  assert.equal(result.modes.reduce((sum, row) => sum + row.students, 0), 4);
  assert.equal(result.modes.reduce((sum, row) => sum + row.attempts, 0), result.summary.attempts);
  assert.equal(result.modes.find((row) => row.key === "unknown")?.label, "ไม่ระบุโหมด (ข้อมูลเดิม)");
  assert.equal(result.modes.find((row) => row.key === "constructor")?.label, "constructor");
});

test("lesson identity comes from question ID and band; small samples do not lead the ranking", () => {
  const profiles = [profile("a", "primary"), profile("b", "primary"), profile("c", "primary")];
  const attempts = Array.from({ length: 21 }, (_, i) => attempt(profiles[i % 3].id, { is_correct: i % 2 === 0 }));
  attempts.push(attempt("a", { question_id: 2, is_correct: false }), attempt("a", { question_id: null }));
  const result = aggregateAnalytics(profiles, attempts, [
    { id: 1, category: "fractions", grade_band: "primary" },
    { id: 2, category: "fractions", grade_band: "junior" },
  ], now);
  assert.equal(result.lessons.length, 2);
  assert.equal(result.lessons[0].band, "primary");
  assert.equal(result.lessons[0].reliable, true);
  assert.equal(result.lessons[1].reliable, false);
  assert.equal(result.unmappedAttempts, 1);
  assert.equal(result.summary.attempts, 23);
});

test("empty cohorts display unavailable percentages rather than misleading zero scores", () => {
  const result = aggregateAnalytics([], [], [], now);
  assert.equal(result.summary.accuracyPct, null);
  assert.equal(result.repeatPct, null);
  assert.equal(result.averageQuestions, null);
  assert.equal(result.questionsPerDay.length, 14);
});
