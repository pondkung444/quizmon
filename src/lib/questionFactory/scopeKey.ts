export const QUESTION_FACTORY_SCOPE_KEY_VERSION = "v1" as const;

export type QuestionFactoryEducationStage = "lower_secondary" | "upper_secondary";
export type QuestionFactorySubject = "math" | "science" | "physics" | "chemistry" | "biology";

export type QuestionFactoryScope = {
  stage: QuestionFactoryEducationStage;
  grade: 7 | 8 | 9 | 10 | 11 | 12;
  subject: QuestionFactorySubject;
  unit: string;
};

const SCOPE_KEY_PATTERN =
  /^qf:v1\|stage=(lower_secondary|upper_secondary)\|grade=(7|8|9|10|11|12)\|subject=(math|science|physics|chemistry|biology)\|unit=([a-z0-9]+(?:_[a-z0-9]+)*)$/;
const UNIT_ID_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const MAX_UNIT_ID_LENGTH = 64;

function assertCompatibleScope(scope: Omit<QuestionFactoryScope, "unit">): void {
  const isLowerSecondary =
    scope.stage === "lower_secondary" &&
    scope.grade >= 7 &&
    scope.grade <= 9 &&
    (scope.subject === "math" || scope.subject === "science");
  const isUpperSecondary =
    scope.stage === "upper_secondary" &&
    scope.grade >= 10 &&
    scope.grade <= 12 &&
    (scope.subject === "physics" || scope.subject === "chemistry" || scope.subject === "biology");

  if (!isLowerSecondary && !isUpperSecondary) {
    throw new Error("Question Factory scope has an incompatible stage, grade, and subject combination");
  }
}

export function normalizeQuestionFactoryUnitId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (
    normalized.length === 0 ||
    normalized.length > MAX_UNIT_ID_LENGTH ||
    !UNIT_ID_PATTERN.test(normalized)
  ) {
    throw new Error("Question Factory unit must normalize to 1-64 lowercase ASCII letters, digits, or underscores");
  }

  return normalized;
}

export function buildQuestionFactoryScopeKey(scope: QuestionFactoryScope): string {
  assertCompatibleScope(scope);
  const unit = normalizeQuestionFactoryUnitId(scope.unit);

  return `qf:${QUESTION_FACTORY_SCOPE_KEY_VERSION}|stage=${scope.stage}|grade=${scope.grade}|subject=${scope.subject}|unit=${unit}`;
}

export function parseQuestionFactoryScopeKey(scopeKey: string): QuestionFactoryScope {
  const match = SCOPE_KEY_PATTERN.exec(scopeKey);
  if (!match) {
    throw new Error("Invalid or non-canonical Question Factory scope key");
  }

  const scope = {
    stage: match[1] as QuestionFactoryEducationStage,
    grade: Number(match[2]) as QuestionFactoryScope["grade"],
    subject: match[3] as QuestionFactorySubject,
    unit: match[4],
  };
  assertCompatibleScope(scope);

  if (scope.unit.length > MAX_UNIT_ID_LENGTH) {
    throw new Error("Question Factory unit exceeds 64 characters");
  }

  return scope;
}

export function isQuestionFactoryScopeKey(value: string): boolean {
  try {
    parseQuestionFactoryScopeKey(value);
    return true;
  } catch {
    return false;
  }
}
