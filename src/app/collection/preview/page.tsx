import Link from "next/link";
import { notFound } from "next/navigation";
import SubjectPreview from "@/components/farm/SubjectPreview";
import {
  generatePuzzle,
  publicPuzzle,
  validatePuzzle,
  puzzleHint,
  type PuzzleKind,
} from "@/lib/farm/puzzle-engine";
import { hintText } from "@/lib/farm/lesson-server";
import type { SubjectDraft } from "@/components/farm/SubjectPuzzle";
import type { HintTier } from "@/lib/farm/puzzles/core";
export default async function FarmPuzzlePreview({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.FARM_PREVIEW !== "true"
  )
    notFound();
  const input = (await searchParams).kind ?? "pond";
  if (!["pond", "flower", "bridge", "observatory"].includes(input)) notFound();
  const kind = input as PuzzleKind,
    puzzle = generatePuzzle(kind, 17445);
  async function submit(draft: SubjectDraft) {
    "use server";
    if (
      process.env.NODE_ENV !== "development" ||
      process.env.FARM_PREVIEW !== "true"
    )
      throw new Error("Preview unavailable");
    const passed = validatePuzzle(puzzle, draft).ok;
    return {
      passed,
      message: passed
        ? "ผ่านข้อมูลจำลอง · ไม่มีการเปลี่ยนบัญชีจริง"
        : "แก้ผังจำลองเดิมต่อได้",
    };
  }
  async function hint(draft: SubjectDraft, tier: HintTier) {
    "use server";
    if (
      process.env.NODE_ENV !== "development" ||
      process.env.FARM_PREVIEW !== "true" ||
      ![1, 2, 3].includes(tier)
    )
      throw new Error("Preview unavailable");
    return hintText(puzzleHint(puzzle, draft, tier));
  }
  return (
    <main style={{ padding: 12 }}>
      <h1>ตัวอย่าง Qmon Farm</h1>
      <p>
        ข้อมูลจำลองสำหรับตรวจหน้าจอและบทเรียน · ไม่เชื่อมฐานข้อมูลหรือบัญชีจริง
      </p>
      <nav style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {(["pond", "flower", "bridge", "observatory"] as const).map((k) => (
          <Link key={k} href={`?kind=${k}`}>
            {
              {
                pond: "บ่อน้ำ",
                flower: "สวนดอกไม้",
                bridge: "สะพาน",
                observatory: "หอดูดาว",
              }[k]
            }
          </Link>
        ))}
      </nav>
      <SubjectPreview
        key={kind}
        puzzle={publicPuzzle(puzzle)}
        submit={submit}
        hint={hint}
      />
    </main>
  );
}
