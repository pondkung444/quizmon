"use server";
import {
  answerSubjectLesson,
  hintSubjectLesson,
  hintText,
} from "@/lib/farm/lesson-server";
import type { HintTier } from "@/lib/farm/puzzles/core";
export async function lessonAnswer(
  id: string,
  revision: number,
  draft: unknown,
  submit: boolean,
) {
  return answerSubjectLesson(id, revision, draft, submit);
}
export async function lessonHint(id: string, draft: unknown, tier: HintTier) {
  return hintText(await hintSubjectLesson(id, draft, tier));
}
