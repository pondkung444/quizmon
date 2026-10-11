"use client";
import type { SchoolPet } from "@/lib/farm/school";
import { useState } from "react";
import FloorPuzzle from "./FloorPuzzle";
import GardenPathPuzzle from "./GardenPathPuzzle";
import type { ConstructionPublic } from "@/lib/farm/construction-puzzles";
import type { FloorPlacement } from "@/lib/farm/floor-puzzle";
import type { GardenPlacement } from "@/lib/farm/garden-path";
import { validateGardenPath } from "@/lib/farm/garden-path";
import type { HintTier } from "@/lib/farm/puzzles/core";
export default function ConstructionPreview({
  puzzle,
  submit,
  hint,
  pet,
}: {
  puzzle: ConstructionPublic;
  pet?: SchoolPet;
  submit: (draft: unknown) => Promise<{ passed: boolean; message: string }>;
  hint: (draft: unknown, tier: HintTier) => Promise<string>;
}) {
  const [layout, setLayout] = useState<FloorPlacement[]>(
      puzzle.kind === "construction-floor" ? [puzzle.fixed] : [],
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [passed, setPassed] = useState(false);
  async function check(layout: FloorPlacement[]) {
    setBusy(true);
    try {
      const r = await submit({ layout });
      setPassed(r.passed);
      setMessage(r.message);
      return r;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3">
      {puzzle.kind === "construction-floor" ? (
        <FloorPuzzle
          fixed={puzzle.fixed}
          practice={false}
          busy={busy || passed}
          feedback={message}
          onDraft={async (value) => setLayout(value)}
          onSubmit={(value) => {
            void check(value).catch((e) => setMessage(String(e)));
          }}
        />
      ) : (
        <GardenPathPuzzle
          embedded
          pet={
            pet ?? {
              id: "synthetic",
              name: "Qmon จำลอง",
              stage: 2,
              busy: false,
              imagePath: "/pets/egg3_stage4_science_A.png",
            }
          }
          boardConfig={puzzle.board}
          initialDraft={layout as GardenPlacement[]}
          onDraft={async (value) => setLayout(value)}
          onCheck={async (value) => {
            const result = await check(value);
            return {
              ...validateGardenPath(value, puzzle.board),
              valid: result.passed,
              message: result.message,
            };
          }}
          practice={true}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {([1, 2, 3] as const).map((tier) => (
          <button
            key={tier}
            disabled={busy}
            className="min-h-11 rounded bg-white/10 px-3"
            onClick={async () => {
              try {
                setMessage(await hint({ layout }, tier));
              } catch (e) {
                setMessage(
                  e instanceof Error
                    ? e.message
                    : "โหลดคำใบ้ไม่สำเร็จ ลองอีกครั้งได้",
                );
              }
            }}
          >
            คำใบ้ {tier}
          </button>
        ))}
      </div>
      <p role="status">{message}</p>
    </section>
  );
}
