/** Versioned server engine adapter; never import this module into a client. */
import {
  pond,
  flower,
  bridge,
  observatory,
  type PondPuzzle,
  type FlowerPuzzle,
  type BridgePuzzle,
  type ObservatoryPuzzle,
  type HintTier,
} from "./puzzles/index.ts";
export type StoredPuzzle =
  PondPuzzle | FlowerPuzzle | BridgePuzzle | ObservatoryPuzzle;
export type PuzzleKind = StoredPuzzle["kind"];
export function generatePuzzle(kind: PuzzleKind, seed: number): StoredPuzzle {
  switch (kind) {
    case "pond":
      return pond.generate(seed);
    case "flower":
      return flower.generate(seed);
    case "bridge":
      return bridge.generate(seed);
    case "observatory":
      return observatory.generate(seed);
  }
}
export function publicPuzzle(p: StoredPuzzle) {
  if (p.version !== 1) throw new Error("รุ่นบทเรียนยังไม่รองรับ");
  switch (p.kind) {
    case "pond":
      return pond.publicView(p);
    case "flower":
      return flower.publicView(p);
    case "bridge":
      return bridge.publicView(p);
    case "observatory":
      return observatory.publicView(p);
  }
}
export type PuzzleView = ReturnType<typeof publicPuzzle>;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v);
const text = (v: unknown) => typeof v === "string" && v.length <= 64;
/** Accept incomplete drafts, reject malformed elements before any engine reads them. */
export function puzzleAnswer(kind: PuzzleKind, value: unknown) {
  if (!record(value) || JSON.stringify(value).length > 8192) return null;
  const field = {
    pond: "tiles",
    flower: "slots",
    bridge: "placements",
    observatory: "order",
  }[kind];
  const rows = value[field];
  if (!Array.isArray(rows) || rows.length > 64) return null;
  if (kind === "observatory")
    return rows.every(text)
      ? ({ kind, answer: { order: rows as string[] } } as const)
      : null;
  if (!rows.every(record)) return null;
  if (kind === "pond")
    return rows.every(
      (x) =>
        integer(x.r) &&
        integer(x.c) &&
        integer(x.rot) &&
        (x.kind === "I" || x.kind === "L") &&
        Number(x.rot) >= 0 &&
        Number(x.rot) <= 3,
    )
      ? ({
          kind,
          answer: {
            tiles: rows as {
              r: number;
              c: number;
              rot: number;
              kind: "I" | "L";
            }[],
          },
        } as const)
      : null;
  if (kind === "flower")
    return rows.every(
      (x) => integer(x.plot) && text(x.factorId) && text(x.cardId),
    )
      ? ({
          kind,
          answer: {
            slots: rows as { plot: number; factorId: string; cardId: string }[],
          },
        } as const)
      : null;
  return rows.every((x) => text(x.weightId) && integer(x.pos))
    ? ({
        kind,
        answer: { placements: rows as { weightId: string; pos: number }[] },
      } as const)
    : null;
}
export function validatePuzzle(p: StoredPuzzle, value: unknown) {
  const a = puzzleAnswer(p.kind, value);
  if (!a || p.version !== 1)
    return { ok: false, wrong: [], reason: "malformed" };
  switch (p.kind) {
    case "pond":
      return a.kind === "pond"
        ? pond.validate(p, a.answer)
        : { ok: false, wrong: [] };
    case "flower":
      return a.kind === "flower"
        ? flower.validate(p, a.answer)
        : { ok: false, wrong: [] };
    case "bridge":
      return a.kind === "bridge"
        ? bridge.validate(p, a.answer)
        : { ok: false, wrong: [] };
    case "observatory":
      return a.kind === "observatory"
        ? observatory.validate(p, a.answer)
        : { ok: false, wrong: [] };
  }
}
export function puzzleHint(p: StoredPuzzle, value: unknown, tier: HintTier) {
  if (p.version !== 1) throw new Error("รุ่นบทเรียนยังไม่รองรับ");
  const a = puzzleAnswer(p.kind, value);
  switch (p.kind) {
    case "pond":
      return pond.hint(p, a?.kind === "pond" ? a.answer : null, tier);
    case "flower":
      return flower.hint(p, a?.kind === "flower" ? a.answer : null, tier);
    case "bridge":
      return bridge.hint(p, a?.kind === "bridge" ? a.answer : null, tier);
    case "observatory":
      return observatory.hint(
        p,
        a?.kind === "observatory" ? a.answer : null,
        tier,
      );
  }
}
