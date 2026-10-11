import {
  generatePuzzle,
  publicPuzzle,
  validatePuzzle,
  puzzleHint,
  puzzleAnswer,
  type StoredPuzzle,
  type PuzzleKind,
} from "./puzzle-engine.ts";
import {
  generateConstruction,
  publicConstruction,
  validateConstruction,
  hintConstruction,
  constructionAnswer,
  type ConstructionKind,
  type ConstructionPuzzle,
} from "./construction-puzzles.ts";
import type { HintTier } from "./puzzles/core.ts";
export type ProjectPuzzleKind = PuzzleKind | ConstructionKind;
export type StoredProjectPuzzle = StoredPuzzle | ConstructionPuzzle;
const construction = (kind: ProjectPuzzleKind): kind is ConstructionKind =>
  kind === "construction-floor" || kind === "construction-path";
export function generateProjectPuzzle(
  kind: ProjectPuzzleKind,
  seed: number,
): StoredProjectPuzzle {
  return construction(kind)
    ? generateConstruction(kind, seed)
    : generatePuzzle(kind, seed);
}
export function publicProjectPuzzle(p: StoredProjectPuzzle) {
  return p.kind === "construction-floor" || p.kind === "construction-path"
    ? publicConstruction(p)
    : publicPuzzle(p);
}
export type ProjectPuzzleView = ReturnType<typeof publicProjectPuzzle>;
export function projectAnswer(kind: ProjectPuzzleKind, value: unknown) {
  return construction(kind)
    ? constructionAnswer({ kind }, value)
    : puzzleAnswer(kind, value);
}
export function validateProjectPuzzle(p: StoredProjectPuzzle, value: unknown) {
  return p.kind === "construction-floor" || p.kind === "construction-path"
    ? validateConstruction(p, value)
    : validatePuzzle(p, value);
}
export function hintProjectPuzzleEngine(
  p: StoredProjectPuzzle,
  value: unknown,
  tier: HintTier,
) {
  return p.kind === "construction-floor" || p.kind === "construction-path"
    ? hintConstruction(p, value, tier)
    : puzzleHint(p, value, tier);
}
