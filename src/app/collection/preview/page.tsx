import AttentionPreview from "@/components/farm/AttentionPreview";
import SocialPreview from "@/components/farm/SocialPreview";
import PlaceHistoryView from "@/components/farm/PlaceHistoryView";
import ActivitiesPreview from "@/components/farm/ActivitiesPreview";
import LayoutPreview from "@/components/farm/LayoutPreview";
import ProjectQueuePreview from "@/components/farm/ProjectQueuePreview";
import Link from "next/link";
import { notFound } from "next/navigation";
import ConstructionPreview from "@/components/farm/ConstructionPreview";
import {
  generateConstruction,
  publicConstruction,
  validateConstruction,
  hintConstruction,
} from "@/lib/farm/construction-puzzles";
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
  if (input === "attention") return <AttentionPreview />;
  if (input === "social") return <SocialPreview />;
  if (input === "history")
    return (
      <PlaceHistoryView
        place={{
          id: "main-school",
          kind: "school",
          level: 4,
          image: "/farm/qmon-school-l4-v1.png",
          completedAt: "2026-10-12T12:00:00Z",
          legacyNote: true,
          contributors: [
            {
              name: "หัวหน้าคนแรก",
              role: "leader",
              joinedAt: "2026-10-01T12:00:00Z",
              leftAt: "2026-10-02T12:00:00Z",
            },
            {
              name: "คู่หูผู้ช่วย",
              role: "helper",
              joinedAt: "2026-10-03T12:00:00Z",
              leftAt: "2026-10-04T12:00:00Z",
            },
            {
              name: "Qmon ที่เคยร่วมงาน",
              role: "legacy",
              joinedAt: null,
              leftAt: null,
            },
          ],
        }}
      />
    );
  if (input === "activities")
    return (
      <main className="mx-auto max-w-4xl p-3">
        <ActivitiesPreview />
      </main>
    );
  if (input === "layout17" || input === "layout24")
    return (
      <main className="mx-auto max-w-4xl p-3">
        <h1>ผังฟาร์มจำลอง</h1>
        <LayoutPreview count={input === "layout24" ? 24 : 17} />
      </main>
    );
  if (
    input === "teams" ||
    input === "catalogue" ||
    input === "catalogue-endgame"
  )
    return (
      <main className="mx-auto max-w-xl p-3">
        <h1>ทีมจำลอง · ไม่เชื่อมฐานจริง</h1>
        <ProjectQueuePreview
          catalogueMode={input !== "teams"}
          endgame={input === "catalogue-endgame"}
        />
      </main>
    );
  if (input === "construction-floor" || input === "construction-path") {
    const board = generateConstruction(input, 17445);
    async function constructionSubmit(draft: unknown) {
      "use server";
      if (
        process.env.NODE_ENV !== "development" ||
        process.env.FARM_PREVIEW !== "true"
      )
        throw Error("Preview unavailable");
      const result = validateConstruction(board, draft);
      return {
        passed: result.ok,
        message: result.ok
          ? "ผ่านผังจำลอง · ไม่เปลี่ยนข้อมูลบัญชีจริง"
          : result.message,
      };
    }
    async function constructionHint(draft: unknown, tier: HintTier) {
      "use server";
      if (
        process.env.NODE_ENV !== "development" ||
        process.env.FARM_PREVIEW !== "true" ||
        ![1, 2, 3].includes(tier)
      )
        throw Error("Preview unavailable");
      return hintConstruction(board, draft, tier);
    }
    return (
      <main className="mx-auto max-w-xl p-3">
        <h1>ผังโรงเรียนจำลอง</h1>
        <p>ข้อมูลจำลอง ไม่เชื่อมฐานจริง</p>
        <ConstructionPreview
          key={input}
          puzzle={publicConstruction(board)}
          submit={constructionSubmit}
          hint={constructionHint}
        />
      </main>
    );
  }
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
