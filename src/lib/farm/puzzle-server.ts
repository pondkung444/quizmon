import "server-only";
import { randomInt } from "node:crypto";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateProjectPuzzle as generatePuzzle,
  publicProjectPuzzle as publicPuzzle,
  validateProjectPuzzle as validatePuzzle,
  projectAnswer as puzzleAnswer,
  hintProjectPuzzleEngine as puzzleHint,
  type StoredProjectPuzzle as StoredPuzzle,
  type ProjectPuzzleKind as PuzzleKind,
} from "./project-puzzle-engine";
import type { FarmProject } from "./projects-server";
import type { HintTier } from "./puzzles/core";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function projectKind(p: FarmProject): PuzzleKind {
  const place = p.rules_snapshot.place;
  if (["pond", "flower", "bridge", "observatory"].includes(place))
    return place as PuzzleKind;
  if (place === "school")return p.checkpoint%2===0?'construction-floor':'construction-path';
  if (place === "garden")return 'construction-path';
  throw new Error("โครงการนี้ใช้บทเรียนสวนเดิม");
}
async function owner(projectId: string) {
  const user = await getUser();
  if (!user) throw new Error("ต้องเข้าสู่ระบบก่อน");
  if (!uuid.test(projectId)) throw new Error("เลือกโครงการของเรา");
  const db = createAdminClient();
  const { data, error } = await db
    .from("farm_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (error || !data) throw new Error("ไม่พบโครงการของเรา");
  return { user, db, project: data as FarmProject };
}
export async function openProjectPuzzle(projectId: string) {
  const { user, db, project } = await owner(projectId);
  const prior = await db
    .from("farm_project_checkpoints")
    .select("puzzle")
    .eq("project_id", projectId)
    .lt("checkpoint", project.checkpoint)
    .order("checkpoint", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prior.error) throw new Error("โหลดผังเดิมไม่สำเร็จ");
  const last = prior.data?.puzzle as StoredPuzzle | undefined;
  let candidate = generatePuzzle(
    projectKind(project),
    randomInt(0, 0x100000000),
  );
  if (last) {
    for (
      let i = 0;
      JSON.stringify(publicPuzzle(candidate)) ===
        JSON.stringify(publicPuzzle(last)) && i < 25;
      i++
    )
      candidate = generatePuzzle(
        projectKind(project),
        randomInt(0, 0x100000000),
      );
    if (
      JSON.stringify(publicPuzzle(candidate)) ===
      JSON.stringify(publicPuzzle(last))
    )
      throw new Error("สร้างผังใหม่ไม่สำเร็จ");
  }
  const { data, error } = await db.rpc("farm_puzzle_open", {
    p_user: user.id,
    p_id: projectId,
    p_checkpoint: project.checkpoint,
    p_puzzle: candidate,
  });
  if (error) throw new Error("เปิดจุดช่วยไม่สำเร็จ");
  const session = data.session as {
    session_id: string;
    puzzle: StoredPuzzle;
    draft: unknown;
    draft_revision: number;
  };
  return {
    sessionId: session.session_id,
    puzzle: publicPuzzle(session.puzzle),
    draft: session.draft,
    revision: session.draft_revision,
    project: data.project as FarmProject,
  };
}
async function saved(projectId: string, sessionId: string) {
  const context = await owner(projectId);
  if (!uuid.test(sessionId)) throw new Error("ผังไม่ถูกต้อง");
  const { data, error } = await context.db
    .from("farm_project_checkpoints")
    .select("puzzle,session_id")
    .eq("project_id", projectId)
    .eq("checkpoint", context.project.checkpoint)
    .single();
  if (error || !data || data.session_id !== sessionId)
    throw new Error("ผังเปลี่ยนแล้ว");
  return { ...context, puzzle: data.puzzle as StoredPuzzle };
}
export async function saveProjectDraft(
  projectId: string,
  sessionId: string,
  revision: number,
  draft: unknown,
) {
  const { user, db, puzzle } = await saved(projectId, sessionId);
  if (
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !puzzleAnswer(puzzle.kind, draft)
  )
    throw new Error("ผังร่างไม่ถูกต้อง");
  const { data, error } = await db.rpc("farm_puzzle_draft", {
    p_user: user.id,
    p_id: projectId,
    p_session: sessionId,
    p_revision: revision,
    p_draft: draft,
  });
  if (error) throw new Error("เก็บผังร่างไม่สำเร็จ");
  return data as { revision: number; draft: unknown; saved: boolean };
}
export async function submitProjectPuzzle(
  projectId: string,
  sessionId: string,
  deadline: string,
  requestId: string,
  draft: unknown,
) {
  const { user, db } = await owner(projectId);
  if (!uuid.test(sessionId) || !uuid.test(requestId))
    throw new Error("คำตอบไม่ถูกต้อง");
  const previous = await db
    .from("farm_puzzle_submissions")
    .select("session_id,response")
    .eq("project_id", projectId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (previous.error) throw new Error("โหลดคำตอบเดิมไม่สำเร็จ");
  if (previous.data) {
    if (previous.data.session_id !== sessionId)
      throw new Error("คำขอถูกใช้กับผังอื่น");
    return { ...previous.data.response, wrong: [] } as {
      passed: boolean;
      project: FarmProject;
      wrong: string[];revision?:number;
    };
  }
  const { puzzle } = await saved(projectId, sessionId);
  if (
    !uuid.test(requestId) ||
    !Number.isFinite(Date.parse(deadline)) ||
    !puzzleAnswer(puzzle.kind, draft)
  )
    throw new Error("คำตอบไม่ถูกต้อง");
  const verdict = validatePuzzle(puzzle, draft);
  const { data, error } = await db.rpc("farm_puzzle_submit", {
    p_user: user.id,
    p_id: projectId,
    p_session: sessionId,
    p_deadline: deadline,
    p_request: requestId,
    p_draft: draft,
    p_passed: verdict.ok,
  });
  if (error) throw new Error("รอบเล่นเปลี่ยนแล้ว กรุณาโหลดสถานะอีกครั้ง");
  return { ...data, wrong: verdict.wrong } as {
    passed: boolean;
    project: FarmProject;
    wrong: string[];revision:number;
  };
}
export async function hintProjectPuzzle(
  projectId: string,
  sessionId: string,
  draft: unknown,
  tier: HintTier,
) {
  if (![1, 2, 3].includes(tier)) throw new Error("คำใบ้ไม่ถูกต้อง");
  const { puzzle } = await saved(projectId, sessionId);
  return puzzleHint(puzzle, draft, tier);
}
