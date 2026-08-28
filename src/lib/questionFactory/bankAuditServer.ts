import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveCurriculumChapter,
  type ResolveCurriculumChapterInput,
  type ResolvedCurriculumChapterSnapshot,
} from "@/lib/questionFactory/curriculumChapterServer";

type QuestionAuditRow = {
  id: number;
  status: string;
  difficulty: number;
  category: string;
  image_url: string | null;
};

export type FactoryBankAuditSnapshot = {
  schemaVersion: "question-factory-bank-audit/v1";
  auditedAt: string;
  curriculum: ResolvedCurriculumChapterSnapshot;
  counts: {
    total: number;
    active: number;
    pipelineReady: number;
    draft: number;
    pendingReview: number;
    inactive: number;
    withImage: number;
  };
  activeByDifficulty: Record<string, number>;
  pipelineByDifficulty: Record<string, number>;
  categories: Array<{ category: string; total: number; active: number }>;
  unavailableDimensions: readonly ["learning_objective", "cognitive_demand", "question_archetype"];
  checksum: string;
};

function auditChecksum(value: Omit<FactoryBankAuditSnapshot, "checksum">): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function addCount(target: Record<string, number>, difficulty: number): void {
  const key = String(difficulty);
  target[key] = (target[key] ?? 0) + 1;
}

export async function auditFactoryQuestionBank(
  input: ResolveCurriculumChapterInput
): Promise<FactoryBankAuditSnapshot> {
  const curriculum = await resolveCurriculumChapter(input);
  const admin = createAdminClient();
  let query = admin
    .from("questions")
    .select("id, status, difficulty, category, image_url")
    .eq("grade_band", curriculum.gradeBand)
    .eq("grade_level", curriculum.gradeLevel)
    .eq("subject", curriculum.productSubject)
    .eq("chapter", curriculum.chapter)
    .order("id", { ascending: true })
    .limit(5000);
  query = curriculum.productBranch === null
    ? query.is("branch", null)
    : query.eq("branch", curriculum.productBranch);

  const { data, error } = await query;
  if (error) throw new Error(`Unable to audit Question Factory bank: ${error.message}`);
  const rows = (data ?? []) as QuestionAuditRow[];
  if (rows.length === 5000) throw new Error("Question Factory bank audit exceeded the safe row limit");

  const activeByDifficulty: Record<string, number> = {};
  const pipelineByDifficulty: Record<string, number> = {};
  const categoryMap = new Map<string, { total: number; active: number }>();
  let active = 0, draft = 0, pendingReview = 0, inactive = 0, withImage = 0;

  for (const row of rows) {
    if (!Number.isInteger(row.difficulty)) throw new Error(`Question ${row.id} has invalid difficulty`);
    if (row.image_url) withImage += 1;
    if (row.status === "active") {
      active += 1;
      addCount(activeByDifficulty, row.difficulty);
      addCount(pipelineByDifficulty, row.difficulty);
    } else if (row.status === "draft") {
      draft += 1;
      addCount(pipelineByDifficulty, row.difficulty);
    } else if (row.status === "pending_review") {
      pendingReview += 1;
      addCount(pipelineByDifficulty, row.difficulty);
    } else if (row.status === "inactive") inactive += 1;
    else throw new Error(`Question ${row.id} has unsupported status ${row.status}`);

    const category = categoryMap.get(row.category) ?? { total: 0, active: 0 };
    category.total += 1;
    if (row.status === "active") category.active += 1;
    categoryMap.set(row.category, category);
  }

  const snapshot = {
    schemaVersion: "question-factory-bank-audit/v1" as const,
    auditedAt: new Date().toISOString(),
    curriculum,
    counts: {
      total: rows.length, active, pipelineReady: active + draft + pendingReview,
      draft, pendingReview, inactive, withImage,
    },
    activeByDifficulty,
    pipelineByDifficulty,
    categories: [...categoryMap.entries()]
      .map(([category, counts]) => ({ category, ...counts }))
      .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, "th")),
    unavailableDimensions: ["learning_objective", "cognitive_demand", "question_archetype"] as const,
  };
  return { ...snapshot, checksum: auditChecksum(snapshot) };
}
