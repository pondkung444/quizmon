"use server";
import { loadFarmWallet } from "@/lib/farm/garden-server";
import { revalidatePath } from "next/cache";
import {
  runProjectCommand,
  type ProjectInput,
  type FarmProject,
} from "@/lib/farm/projects-server";
import {
  openProjectPuzzle,
  saveProjectDraft,
  submitProjectPuzzle,
  hintProjectPuzzle,
} from "@/lib/farm/puzzle-server";
import { hintText } from "@/lib/farm/lesson-server";
import type { HintTier } from "@/lib/farm/puzzles/core";
export async function projectCommand(
  operation: Parameters<typeof runProjectCommand>[0],
  input: ProjectInput,
): Promise<FarmProject & { walletBalance?: number }> {
  const project = await runProjectCommand(operation, input);
  const walletBalance =
    operation === "buy" ? (await loadFarmWallet()).balance : undefined;
  revalidatePath("/collection/projects");
  revalidatePath("/collection/school");
  revalidatePath("/collection");
  return { ...project, walletBalance };
}
export async function beginProjectPuzzle(id: string) {
  await runProjectCommand("begin", { projectId: id });
  return openProjectPuzzle(id);
}
export async function persistProjectDraft(
  id: string,
  session: string,
  revision: number,
  draft: unknown,
) {
  return saveProjectDraft(id, session, revision, draft);
}
export async function answerProjectPuzzle(
  id: string,
  session: string,
  deadline: string,
  request: string,
  draft: unknown,
) {
  return submitProjectPuzzle(id, session, deadline, request, draft);
}
export async function projectHint(
  id: string,
  session: string,
  draft: unknown,
  tier: HintTier,
) {
  const hint = await hintProjectPuzzle(id, session, draft, tier);
  return typeof hint === "string" ? hint : hintText(hint);
}
