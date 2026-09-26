export type PvpRecord = { wins: number; losses: number; draws: number; abandoned: number };
export type HistoryMatch = {
  id: string; player_a_id: string; player_b_id: string;
  status: string; outcome: string | null; last_action_at: string;
};
export type RivalRecord = PvpRecord & { opponentId: string; opponentName: string; lastPlayed: string };
export type PvpHistorySummary = { totals: PvpRecord; rivals: RivalRecord[]; rivalCount: number };

export function matchResult(m: HistoryMatch, userId: string): keyof PvpRecord | null {
  if (m.player_a_id !== userId && m.player_b_id !== userId) return null;
  if (m.status === "abandoned") return "abandoned";
  if (m.status !== "finished") return null;
  if (m.outcome === "draw") return "draws";
  if (m.outcome !== "a_win" && m.outcome !== "b_win") return null;
  const won = m.outcome === (m.player_a_id === userId ? "a_win" : "b_win");
  return won ? "wins" : "losses";
}

export function completedCount(record: PvpRecord) {
  return record.wins + record.losses + record.draws;
}

export function summarizeHistory(matches: HistoryMatch[], userId: string): PvpHistorySummary {
  const totals: PvpRecord = { wins: 0, losses: 0, draws: 0, abandoned: 0 };
  const rivals = new Map<string, RivalRecord>();
  for (const match of matches) {
    const result = matchResult(match, userId);
    if (!result) continue;
    const opponentId = match.player_a_id === userId ? match.player_b_id : match.player_a_id;
    const rival = rivals.get(opponentId) ?? {
      opponentId, opponentName: "คู่ต่อสู้", lastPlayed: match.last_action_at,
      wins: 0, losses: 0, draws: 0, abandoned: 0,
    };
    rival[result]++;
    totals[result]++;
    if (match.last_action_at > rival.lastPlayed) rival.lastPlayed = match.last_action_at;
    rivals.set(opponentId, rival);
  }
  return { totals, rivalCount: rivals.size, rivals: [...rivals.values()].sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed) || a.opponentId.localeCompare(b.opponentId)) };
}
