import test from "node:test";
import assert from "node:assert/strict";
import { summarizeHistory, matchResult, completedCount, type HistoryMatch } from "../../src/lib/pvp/historyStats.ts";

const match = (overrides: Partial<HistoryMatch> = {}): HistoryMatch => ({
  id: "1", player_a_id: "me", player_b_id: "friend", status: "finished", outcome: "a_win", last_action_at: "2026-09-27T00:00:00Z", ...overrides,
});

test("results are from the viewer's side, including swapped player positions", () => {
  assert.equal(matchResult(match(), "me"), "wins");
  assert.equal(matchResult(match(), "friend"), "losses");
  assert.equal(matchResult(match({ outcome: "b_win" }), "me"), "losses");
  assert.equal(matchResult(match({ outcome: "b_win" }), "friend"), "wins");
  assert.equal(matchResult(match({ outcome: "draw" }), "me"), "draws");
});

test("unfinished, unrelated and invalid matches do not inflate completed results", () => {
  const summary = summarizeHistory([
    match(), match({ status: "abandoned", outcome: null }),
    match({ status: "active", outcome: null }), match({ outcome: null }),
    match({ player_a_id: "stranger", player_b_id: "other" }),
  ], "me");
  assert.deepEqual(summary.totals, { wins: 1, losses: 0, draws: 0, abandoned: 1 });
  assert.equal(completedCount(summary.totals), 1);
  assert.equal(summary.rivalCount, 1);
});

test("summaries include more than the old twenty-match history and group by opponent ID", () => {
  const rows = Array.from({ length: 1101 }, (_, i) => match({ id: String(i), outcome: i % 2 ? "b_win" : "a_win" }));
  rows.push(match({ player_a_id: "second", player_b_id: "me", outcome: "draw", last_action_at: "2026-09-28T00:00:00Z" }));
  const summary = summarizeHistory(rows, "me");
  assert.deepEqual(summary.totals, { wins: 551, losses: 550, draws: 1, abandoned: 0 });
  assert.equal(summary.rivalCount, 2);
  assert.equal(summary.rivals[0].opponentId, "second");
  assert.equal(summary.rivals[1].wins, 551);
});

test("empty history has no invented opponent or win rate", () => {
  assert.deepEqual(summarizeHistory([], "me"), { totals: { wins: 0, losses: 0, draws: 0, abandoned: 0 }, rivals: [], rivalCount: 0 });
});
