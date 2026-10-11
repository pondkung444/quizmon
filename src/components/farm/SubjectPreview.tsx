"use client";
import { useSyncExternalStore } from "react";
import SubjectPuzzle, { type SubjectDraft } from "./SubjectPuzzle";
import type { PuzzleView } from "@/lib/farm/puzzle-engine";
import type { HintTier } from "@/lib/farm/puzzles/core";
const subscribe = () => () => {};
export default function SubjectPreview({
  puzzle,
  submit,
  hint,
}: {
  puzzle: PuzzleView;
  submit: (
    draft: SubjectDraft,
  ) => Promise<{ passed: boolean; message: string }>;
  hint: (draft: SubjectDraft, tier: HintTier) => Promise<string>;
}) {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!ready) return <p>กำลังเปิดข้อมูลจำลอง…</p>;
  const key = "qmon-preview-draft-" + puzzle.kind;
  let initial: Partial<SubjectDraft> | null = null;
  try {
    initial = JSON.parse(sessionStorage.getItem(key) ?? "null");
  } catch {}
  return (
    <SubjectPuzzle
      puzzle={puzzle}
      initialDraft={initial}
      onDraft={async (value) => {
        sessionStorage.setItem(key, JSON.stringify(value));
      }}
      onSubmit={submit}
      onHint={hint}
    />
  );
}
