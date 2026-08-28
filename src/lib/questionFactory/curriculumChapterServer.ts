import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  factoryCurriculumRoute,
  isCurriculumChapterKey,
  type CurriculumChapterBranch,
  type CurriculumChapterGradeLevel,
  type CurriculumChapterProductSubject,
} from "@/lib/questionFactory/curriculumChapter";
import type {
  QuestionFactoryEducationStage,
  QuestionFactoryScope,
  QuestionFactorySubject,
} from "@/lib/questionFactory/scopeKey";

type CurriculumChapterRow = {
  id: number;
  chapter_key: string;
  grade_band: string;
  grade_level: string | null;
  grade_order: number;
  subject: string;
  branch: string | null;
  subject_label: string;
  chapter: string;
  chapter_order: number;
};

export type ResolvedCurriculumChapterSnapshot = {
  schemaVersion: "curriculum-chapter/v1";
  curriculumChapterId: number;
  curriculumChapterKey: string;
  gradeBand: "junior" | "senior";
  gradeLevel: CurriculumChapterGradeLevel;
  gradeOrder: number;
  factorySubject: QuestionFactorySubject;
  productSubject: CurriculumChapterProductSubject;
  productBranch: CurriculumChapterBranch | null;
  subjectLabel: string;
  chapter: string;
  chapterOrder: number;
  checksum: string;
};

export type ResolveCurriculumChapterInput = {
  chapterKey: string;
  stage: QuestionFactoryEducationStage;
  grade: QuestionFactoryScope["grade"];
  subject: QuestionFactorySubject;
};

function snapshotChecksum(value: Omit<ResolvedCurriculumChapterSnapshot, "checksum">): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export async function resolveCurriculumChapter(
  input: ResolveCurriculumChapterInput
): Promise<ResolvedCurriculumChapterSnapshot> {
  if (!isCurriculumChapterKey(input.chapterKey)) {
    throw new Error("Invalid curriculum chapter key");
  }

  const route = factoryCurriculumRoute(input);
  const admin = createAdminClient();
  let query = admin
    .from("curriculum_chapters")
    .select("id, chapter_key, grade_band, grade_level, grade_order, subject, branch, subject_label, chapter, chapter_order")
    .eq("chapter_key", input.chapterKey)
    .eq("grade_band", route.gradeBand)
    .eq("grade_level", route.gradeLevel)
    .eq("subject", route.productSubject)
    .limit(2);

  query = route.branch === null ? query.is("branch", null) : query.eq("branch", route.branch);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to resolve curriculum chapter: ${error.message}`);
  if (!data || data.length !== 1) {
    throw new Error(data?.length ? "Ambiguous curriculum chapter mapping" : "Unknown curriculum chapter mapping");
  }

  const row = data[0] as CurriculumChapterRow;
  if (
    row.grade_band !== route.gradeBand ||
    row.grade_level !== route.gradeLevel ||
    row.subject !== route.productSubject ||
    row.branch !== route.branch ||
    row.chapter_key !== input.chapterKey ||
    row.grade_order < 0 ||
    row.chapter_order <= 0 ||
    row.subject_label.trim() === "" ||
    row.chapter.trim() === ""
  ) {
    throw new Error("Curriculum chapter row failed the Factory registry contract");
  }

  const snapshot = {
    schemaVersion: "curriculum-chapter/v1" as const,
    curriculumChapterId: row.id,
    curriculumChapterKey: row.chapter_key,
    gradeBand: route.gradeBand,
    gradeLevel: route.gradeLevel,
    gradeOrder: row.grade_order,
    factorySubject: input.subject,
    productSubject: route.productSubject,
    productBranch: route.branch,
    subjectLabel: row.subject_label,
    chapter: row.chapter,
    chapterOrder: row.chapter_order,
  };

  return { ...snapshot, checksum: snapshotChecksum(snapshot) };
}
