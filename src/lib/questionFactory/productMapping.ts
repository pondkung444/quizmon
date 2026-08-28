import { createHash } from "node:crypto";

import { factoryCurriculumRoute } from "./curriculumChapter.ts";
import type { ResolvedCurriculumChapterSnapshot } from "./curriculumChapterServer.ts";
import {
  validateFactoryQuestionCandidate,
  type FactoryQuestionCandidate,
  type FactoryTextSlotSpec,
} from "./textCandidate.ts";
import type {
  QuestionFactoryEducationStage,
  QuestionFactoryScope,
  QuestionFactorySubject,
} from "./scopeKey.ts";

export const PRODUCT_MAPPING_VERSION = "question-product-mapping/v1" as const;

export type ProductCategoryMappingEntry = {
  id: string;
  mappingVersion: typeof PRODUCT_MAPPING_VERSION;
  stage: QuestionFactoryEducationStage;
  subject: QuestionFactorySubject;
  topicId: string;
  gradeBand: "junior" | "senior";
  productSubject: "math" | "science";
  branch: "physics" | "chemistry" | "biology" | null;
  category: string;
};

export type ApprovedFactoryAssetReference = {
  assetRevision: number;
  checksum: string;
  mimeType: "image/svg+xml" | "image/webp";
  buildSpec: Record<string, unknown>;
};

export type ProductMappingCandidate = {
  schemaVersion: "question-product-candidate/v1";
  mappingVersion: typeof PRODUCT_MAPPING_VERSION;
  mappingEntryId: string;
  curriculumChapterKey: string;
  curriculumChapterChecksum: string;
  questionRevision: number;
  productRow: {
    grade_band: "junior" | "senior";
    subject: "math" | "science";
    branch: "physics" | "chemistry" | "biology" | null;
    category: string;
    grade_level: string;
    chapter: string;
    difficulty: 1 | 2 | 3;
    question_text: string;
    choices: [string, string, string, string];
    correct_index: number;
    explanation: string;
    status: "draft";
    image_url: null;
    image_prompt: null;
    image_filename: null;
    image_type: null;
  };
  approvedAsset: ApprovedFactoryAssetReference | null;
  checksum: string;
};

export type BuildProductMappingCandidateInput = {
  stage: QuestionFactoryEducationStage;
  grade: QuestionFactoryScope["grade"];
  subject: QuestionFactorySubject;
  slotSpec: FactoryTextSlotSpec;
  question: FactoryQuestionCandidate;
  chapter: ResolvedCurriculumChapterSnapshot;
  categoryMapping: ProductCategoryMappingEntry;
  approvedAsset: ApprovedFactoryAssetReference | null;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function assertNonempty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function validateApprovedAsset(
  question: FactoryQuestionCandidate,
  asset: ApprovedFactoryAssetReference | null
): void {
  if (question.needsAsset !== (asset !== null)) {
    throw new Error("Approved asset presence does not match the reviewed question");
  }
  if (!asset) return;
  if (!Number.isSafeInteger(asset.assetRevision) || asset.assetRevision < 1) {
    throw new Error("Approved asset revision must be positive");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(asset.checksum)) {
    throw new Error("Approved asset checksum is invalid");
  }
  if (!asset.buildSpec || Array.isArray(asset.buildSpec)) {
    throw new Error("Approved asset buildSpec must be an object");
  }
}

export function buildProductMappingCandidate(
  input: BuildProductMappingCandidateInput
): ProductMappingCandidate {
  validateFactoryQuestionCandidate(input.question, input.slotSpec);
  validateApprovedAsset(input.question, input.approvedAsset);
  const route = factoryCurriculumRoute({ stage: input.stage, grade: input.grade, subject: input.subject });
  const chapter = input.chapter;
  const mapping = input.categoryMapping;

  if (
    chapter.factorySubject !== input.subject ||
    chapter.gradeBand !== route.gradeBand ||
    chapter.gradeLevel !== route.gradeLevel ||
    chapter.productSubject !== route.productSubject ||
    chapter.productBranch !== route.branch
  ) {
    throw new Error("Curriculum chapter does not match the Factory scope route");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(chapter.checksum)) {
    throw new Error("Curriculum chapter checksum is invalid");
  }
  if (
    mapping.mappingVersion !== PRODUCT_MAPPING_VERSION ||
    mapping.stage !== input.stage ||
    mapping.subject !== input.subject ||
    mapping.topicId !== input.slotSpec.topic ||
    mapping.gradeBand !== route.gradeBand ||
    mapping.productSubject !== route.productSubject ||
    mapping.branch !== route.branch
  ) {
    throw new Error("Product category mapping does not match the Factory scope and topic");
  }
  assertNonempty(mapping.id, "Product category mapping id");
  assertNonempty(mapping.category, "Product category");
  assertNonempty(chapter.chapter, "Curriculum chapter");

  const withoutChecksum = {
    schemaVersion: "question-product-candidate/v1" as const,
    mappingVersion: PRODUCT_MAPPING_VERSION,
    mappingEntryId: mapping.id,
    curriculumChapterKey: chapter.curriculumChapterKey,
    curriculumChapterChecksum: chapter.checksum,
    questionRevision: input.question.revision,
    productRow: {
      grade_band: route.gradeBand,
      subject: route.productSubject,
      branch: route.branch,
      category: mapping.category,
      grade_level: chapter.gradeLevel,
      chapter: chapter.chapter,
      difficulty: input.question.difficulty,
      question_text: input.question.questionText,
      choices: input.question.choices,
      correct_index: input.question.correctIndex,
      explanation: input.question.explanation,
      status: "draft" as const,
      image_url: null,
      image_prompt: null,
      image_filename: null,
      image_type: null,
    },
    approvedAsset: input.approvedAsset,
  };

  return { ...withoutChecksum, checksum: checksum(withoutChecksum) };
}
