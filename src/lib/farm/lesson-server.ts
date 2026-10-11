import "server-only";
import { randomInt } from "node:crypto";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generatePuzzle,
  publicPuzzle,
  puzzleAnswer,
  validatePuzzle,
  puzzleHint,
  type StoredPuzzle,
  type PuzzleKind,
} from "./puzzle-engine";
import type { HintTier } from "./puzzles/core";
export const SUBJECT_LESSONS = {
  pond: {
    blueprint: "pond-cycle-v1",
    name: "บ่อน้ำ · วัฏจักรน้ำ",
    schoolLevel: 2,
  },
  flower: {
    blueprint: "flower-photosynthesis-v1",
    name: "สวนดอกไม้ · พืชสร้างอาหาร",
    schoolLevel: 2,
  },
  bridge: {
    blueprint: "bridge-balance-v1",
    name: "สะพาน · สมดุล",
    schoolLevel: 3,
  },
  observatory: {
    blueprint: "observatory-orbits-v1",
    name: "หอดูดาว · วงโคจร",
    schoolLevel: 4,
  },
} as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function context() {
  const user = await getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  return { user, db: createAdminClient() };
}
export async function openSubjectLesson(
  kind: PuzzleKind,
  petId: string,
  replay = false,
) {
  const { user, db } = await context();
  if (!(kind in SUBJECT_LESSONS) || !uuid.test(petId))
    throw new Error("บทเรียนไม่ถูกต้อง");
  const blueprint = SUBJECT_LESSONS[kind].blueprint;
  const prior = await db
    .from("farm_lesson_sessions")
    .select("puzzle")
    .eq("user_id", user.id)
    .eq("blueprint_id", blueprint)
    .maybeSingle();
  if (prior.error) throw new Error("โหลดบทเรียนเดิมไม่สำเร็จ");
  const last = prior.data?.puzzle as StoredPuzzle | undefined;
  let puzzle = generatePuzzle(kind, randomInt(0, 0x100000000));
  if (replay && last) {
    for (
      let i = 0;
      JSON.stringify(publicPuzzle(last)) ===
        JSON.stringify(publicPuzzle(puzzle)) && i < 25;
      i++
    )
      puzzle = generatePuzzle(kind, randomInt(0, 0x100000000));
    if (
      JSON.stringify(publicPuzzle(last)) ===
      JSON.stringify(publicPuzzle(puzzle))
    )
      throw new Error("สร้างผังทบทวนไม่สำเร็จ ลองอีกครั้ง");
  }
  const { data, error } = await db.rpc("farm_lesson_open", {
    p_user: user.id,
    p_blueprint: blueprint,
    p_pet: petId,
    p_puzzle: puzzle,
    p_replay: replay,
  });
  if (error)
    throw new Error(
      /^(บทเรียน|พัฒนา|เลือก)/.test(error.message)
        ? error.message
        : "เปิดบทเรียนไม่สำเร็จ",
    );
  return {
    sessionId: data.session_id as string,
    puzzle: publicPuzzle(data.puzzle as StoredPuzzle),
    draft: data.draft,
    revision: data.draft_revision as number,
    completed: !!data.completed_at,
  };
}
async function session(id: string) {
  const { user, db } = await context();
  if (!uuid.test(id)) throw new Error("บทเรียนไม่ถูกต้อง");
  const { data, error } = await db
    .from("farm_lesson_sessions")
    .select("puzzle,completed_at")
    .eq("session_id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("ไม่พบบทเรียนของเรา");
  return { user, db, puzzle: data.puzzle as StoredPuzzle };
}
export async function answerSubjectLesson(
  id: string,
  revision: number,
  draft: unknown,
  submit: boolean,
) {
  const { user, db, puzzle } = await session(id);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !puzzleAnswer(puzzle.kind, draft)
  )
    throw new Error("ผังร่างไม่ถูกต้อง");
  const verdict = validatePuzzle(puzzle, draft);
  const { data, error } = await db.rpc("farm_lesson_answer", {
    p_user: user.id,
    p_session: id,
    p_revision: revision,
    p_draft: draft,
    p_submit: submit,
    p_passed: submit && verdict.ok,
  });
  if (error) throw new Error("เก็บบทเรียนไม่สำเร็จ");
  return data as {
    revision: number;
    passed: boolean;
    created: boolean;
    saved: boolean;
    draft: unknown;
  };
}
export async function hintSubjectLesson(
  id: string,
  draft: unknown,
  tier: HintTier,
) {
  if (![1, 2, 3].includes(tier)) throw new Error("คำใบ้ไม่ถูกต้อง");
  const { puzzle } = await session(id);
  return puzzleHint(puzzle, draft, tier);
}
export function hintText(hint: ReturnType<typeof puzzleHint>): string {
  if (hint.tier === 1)
    return "อ่านคำแนะนำและเบาะแสทีละข้อ แล้วลองวางชิ้นแรกก่อน ยังแก้ผังนี้ต่อได้";
  if ("tile" in hint && hint.tile)
    return `ลองท่อ${hint.tile.kind === "I" ? "ตรง" : "โค้ง"} แถว ${hint.tile.r + 1} ช่อง ${hint.tile.c + 1} หมุน ${hint.tile.rot * 90}°`;
  if ("cell" in hint && hint.cell)
    return `ตรวจทางน้ำแถว ${hint.cell.r + 1} ช่อง ${hint.cell.c + 1}`;
  if ("slot" in hint && hint.slot !== null && hint.slot !== undefined) {
    if (typeof hint.slot === "number")
      return "label" in hint && hint.label
        ? `วงโคจร ${hint.slot + 1} ลองวาง${hint.label}`
        : `ตรวจวงโคจร ${hint.slot + 1}`;
    return `ตรวจแปลง ${hint.slot.plot + 1} ช่อง ${hint.slot.factorId === "light" ? "แสง" : hint.slot.factorId === "water" ? "น้ำ" : "ดิน"}${"levelLabel" in hint && hint.levelLabel ? " · ลอง " + hint.levelLabel : ""}`;
  }
  if ("placement" in hint && hint.placement)
    return `ลองก้อน ${hint.placement.weightId.replace("w", "")} ด้าน${hint.placement.pos < 0 ? "ซ้าย" : "ขวา"} ห่างจุดหมุน ${Math.abs(hint.placement.pos)} ช่อง`;
  if ("heavier" in hint)
    return hint.heavier === "incomplete"
      ? "วางน้ำหนักทุกก้อนก่อน"
      : hint.heavier === "balanced"
        ? "คานสมดุลแล้ว"
        : `ด้าน${hint.heavier === "left" ? "ซ้าย" : "ขวา"}หนักกว่า ลองขยับก้อนเข้าหาจุดหมุน`;
  return "ตรวจชิ้นที่ยังว่าง หรือเปิดคำใบ้ขั้นถัดไปได้";
}
