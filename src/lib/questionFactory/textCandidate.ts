export type FactoryTextSlotSpec = {
  learningObjective: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  cognitiveDemand: "recall" | "understand" | "apply" | "analyze" | "evaluate";
  questionArchetype: string;
  representationType: "none" | "svg_geometry" | "svg_graph" | "svg_scientific_diagram";
  answerType: "single_choice";
};

export type FactoryQuestionCandidate = {
  schemaVersion: "question-candidate/v1";
  revision: number;
  questionText: string;
  choices: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  answerType: "single_choice";
  learningObjective: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  cognitiveDemand: FactoryTextSlotSpec["cognitiveDemand"];
  questionArchetype: string;
  representationType: FactoryTextSlotSpec["representationType"];
  needsAsset: boolean;
  assetPrompt: string | null;
  reasoningTemplate: string;
  duplicateRisk: "low" | "medium" | "high";
  authorVersion: string;
};

export type FactoryQcIssue = {
  code: string;
  severity: "minor" | "major" | "critical";
  message: string;
  requiredAction?: string;
};

export type FactoryQcDecision = {
  schemaVersion: "question-qc/v1";
  decision: "PASS" | "REVISE" | "REJECT";
  issues: FactoryQcIssue[];
  checks: Record<string, "pass" | "fail" | "not_applicable">;
  notes: string;
  qcVersion: string;
};

function nonempty(value: string, name: string): void {
  if (!value.trim()) throw new Error(`${name} is required`);
}

export function validateFactoryQuestionCandidate(
  candidate: FactoryQuestionCandidate,
  slot: FactoryTextSlotSpec
): void {
  if (candidate.schemaVersion !== "question-candidate/v1") throw new Error("Unsupported candidate schema");
  if (!Number.isSafeInteger(candidate.revision) || candidate.revision < 1) throw new Error("Candidate revision must be positive");
  nonempty(candidate.questionText, "questionText");
  nonempty(candidate.explanation, "explanation");
  nonempty(candidate.reasoningTemplate, "reasoningTemplate");
  nonempty(candidate.authorVersion, "authorVersion");
  if (!Array.isArray(candidate.choices) || candidate.choices.length !== 4) throw new Error("Adapter v1 requires exactly four choices");
  candidate.choices.forEach((choice, index) => nonempty(choice, `choice ${index}`));
  if (new Set(candidate.choices.map(choice => choice.trim())).size !== 4) throw new Error("Choices must be distinct");
  if (!Number.isSafeInteger(candidate.correctIndex) || candidate.correctIndex < 0 || candidate.correctIndex >= 4) {
    throw new Error("correctIndex must be zero-based and within choices");
  }
  if (
    candidate.learningObjective !== slot.learningObjective || candidate.topic !== slot.topic ||
    candidate.difficulty !== slot.difficulty || candidate.cognitiveDemand !== slot.cognitiveDemand ||
    candidate.questionArchetype !== slot.questionArchetype ||
    candidate.representationType !== slot.representationType || candidate.answerType !== slot.answerType
  ) throw new Error("Candidate does not match its immutable Blueprint Slot");
  const shouldNeedAsset = slot.representationType !== "none";
  if (candidate.needsAsset !== shouldNeedAsset) throw new Error("Candidate asset need conflicts with representation type");
  if (shouldNeedAsset && !candidate.assetPrompt?.trim()) throw new Error("Asset-bearing candidate requires assetPrompt");
  if (!shouldNeedAsset && candidate.assetPrompt !== null) throw new Error("Text-only candidate must use assetPrompt=null");
}

export function validateFactoryQcDecision(decision: FactoryQcDecision): void {
  if (decision.schemaVersion !== "question-qc/v1") throw new Error("Unsupported QC schema");
  nonempty(decision.notes, "QC notes");
  nonempty(decision.qcVersion, "qcVersion");
  if (decision.decision === "PASS" && decision.issues.length) throw new Error("PASS must not contain issues");
  if (decision.decision !== "PASS" && !decision.issues.length) throw new Error("REVISE/REJECT requires at least one issue");
  for (const issue of decision.issues) {
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(issue.code)) throw new Error("QC issue code is invalid");
    nonempty(issue.message, "QC issue message");
    if (decision.decision === "REVISE") nonempty(issue.requiredAction ?? "", "QC requiredAction");
  }
  if (!Object.keys(decision.checks).length) throw new Error("QC checks are required");
  if (Object.values(decision.checks).some(value => value !== "pass" && value !== "fail" && value !== "not_applicable")) {
    throw new Error("QC check result is invalid");
  }
}
