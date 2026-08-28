import {
  buildQuestionFactoryScopeKey,
  type QuestionFactoryEducationStage,
  type QuestionFactoryScope,
  type QuestionFactorySubject,
} from "./scopeKey.ts";

export const CURRICULUM_CHAPTER_KEY_PATTERN = /^cc_[0-9a-f]{24}$/;

export type CurriculumChapterProductSubject = "math" | "science";
export type CurriculumChapterBranch = "physics" | "chemistry" | "biology";
export type CurriculumChapterGradeLevel = "ม.1" | "ม.2" | "ม.3" | "ม.4" | "ม.5" | "ม.6";

export type CurriculumChapterRoute = {
  gradeBand: "junior" | "senior";
  gradeLevel: CurriculumChapterGradeLevel;
  productSubject: CurriculumChapterProductSubject;
  branch: CurriculumChapterBranch | null;
};

export function isCurriculumChapterKey(value: string): boolean {
  return CURRICULUM_CHAPTER_KEY_PATTERN.test(value);
}

export function buildCurriculumChapterScopeKey(input: {
  chapterKey: string;
  stage: QuestionFactoryEducationStage;
  grade: QuestionFactoryScope["grade"];
  subject: QuestionFactorySubject;
}): string {
  if (!isCurriculumChapterKey(input.chapterKey)) {
    throw new Error("Invalid curriculum chapter key");
  }
  return buildQuestionFactoryScopeKey({
    stage: input.stage,
    grade: input.grade,
    subject: input.subject,
    unit: input.chapterKey,
  });
}

export function factoryCurriculumRoute(input: {
  stage: QuestionFactoryEducationStage;
  grade: QuestionFactoryScope["grade"];
  subject: QuestionFactorySubject;
}): CurriculumChapterRoute {
  const gradeLevel = `ม.${input.grade - 6}` as CurriculumChapterGradeLevel;

  if (input.stage === "lower_secondary" && input.grade >= 7 && input.grade <= 9) {
    if (input.subject !== "math" && input.subject !== "science") {
      throw new Error("Lower-secondary curriculum chapters require math or science");
    }
    return {
      gradeBand: "junior",
      gradeLevel,
      productSubject: input.subject,
      branch: null,
    };
  }

  if (input.stage === "upper_secondary" && input.grade >= 10 && input.grade <= 12) {
    if (input.subject === "physics") {
      return { gradeBand: "senior", gradeLevel, productSubject: "math", branch: "physics" };
    }
    if (input.subject === "chemistry" || input.subject === "biology") {
      return { gradeBand: "senior", gradeLevel, productSubject: "science", branch: input.subject };
    }
  }

  throw new Error("Incompatible Factory stage, grade, and subject for curriculum chapter lookup");
}
