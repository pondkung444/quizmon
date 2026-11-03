import type { CardId, ChapterBattle } from "@/lib/raid/cards/engine";

// Raid arena analytics: game facts only, never question text or anything about the child.
export type RaidRoundOutcome = "win" | "turns" | "ko" | "content";
export type RaidAfterEndAction = "replay" | "adventure" | "home";

export function raidRoundOutcome(b: ChapterBattle): RaidRoundOutcome {
  if (b.outcome === "win") return "win";
  // finish_exhausted_raid_chapters writes "content", which the TS ruleset type does not list.
  if ((b.defeatReason as string | undefined) === "content") return "content";
  if (b.hp === 0) return "ko";
  return "turns";
}

export const raidMovePickProps = (b: ChapterBattle, move: CardId, fit: CardId) =>
  ({ boss: b.bossId, turn: b.turn, move, fit: move === fit });

export const raidAnswerProps = (b: ChapterBattle, move: CardId, correct: boolean) =>
  ({ boss: b.bossId, turn: b.turn, move, correct });

export const raidRoundEndProps = (b: ChapterBattle, chapterMode: string | null) => ({
  boss: b.bossId,
  outcome: raidRoundOutcome(b),
  correct: b.log.filter((entry) => entry.answerCorrect !== false).length,
  answered: b.log.length,
  chapterMode: chapterMode ?? "legacy",
});

export const raidAfterEndProps = (b: ChapterBattle, action: RaidAfterEndAction) => ({ boss: b.bossId, action });
