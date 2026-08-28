import { buildProductMappingCandidate } from "../src/lib/questionFactory/productMapping.ts";

const sha = `sha256:${"a".repeat(64)}`;
const slotSpec = {
  learningObjective: "lo_current", topic: "electric_current", difficulty: 2,
  cognitiveDemand: "apply", questionArchetype: "calculation",
  representationType: "none", answerType: "single_choice",
};
const question = {
  schemaVersion: "question-candidate/v1", revision: 1,
  questionText: "กระแสไฟฟ้าในวงจรมีค่าเท่าใด",
  choices: ["1 A", "2 A", "3 A", "4 A"], correctIndex: 1,
  explanation: "ใช้กฎของโอห์ม", answerType: "single_choice",
  ...slotSpec, needsAsset: false, assetPrompt: null,
  reasoningTemplate: "คำนวณจาก V/R", duplicateRisk: "low", authorVersion: "author/v1",
};
const chapter = {
  schemaVersion: "curriculum-chapter/v1", curriculumChapterId: 1,
  curriculumChapterKey: "cc_aaaaaaaaaaaaaaaaaaaaaaaa", gradeBand: "senior",
  gradeLevel: "ม.5", gradeOrder: 5, factorySubject: "physics",
  productSubject: "math", productBranch: "physics", subjectLabel: "ฟิสิกส์",
  chapter: "ไฟฟ้ากระแส", chapterOrder: 1, checksum: sha,
};
const categoryMapping = {
  id: "physics-electric-current-v1", mappingVersion: "question-product-mapping/v1",
  stage: "upper_secondary", subject: "physics", topicId: "electric_current",
  gradeBand: "senior", productSubject: "math", branch: "physics",
  category: "ฟิสิกส์ ม.6 — ไฟฟ้ากระแส",
};
const base = { stage: "upper_secondary", grade: 11, subject: "physics", slotSpec, question, chapter, categoryMapping, approvedAsset: null };

const mapped = buildProductMappingCandidate(base);
if (mapped.productRow.subject !== "math" || mapped.productRow.branch !== "physics") {
  throw new Error("Senior Physics legacy route was not preserved");
}
if (mapped.productRow.status !== "draft" || !/^sha256:[0-9a-f]{64}$/.test(mapped.checksum)) {
  throw new Error("Product mapping candidate status/checksum is invalid");
}

const negativeCases = [
  ["physics-as-subject", { categoryMapping: { ...categoryMapping, productSubject: "physics" } }],
  ["wrong-branch", { categoryMapping: { ...categoryMapping, branch: "chemistry" } }],
  ["wrong-topic", { categoryMapping: { ...categoryMapping, topicId: "waves" } }],
  ["wrong-grade", { grade: 10 }],
  ["blank-category", { categoryMapping: { ...categoryMapping, category: " " } }],
  ["missing-approved-asset", { question: { ...question, needsAsset: true, representationType: "svg_graph", assetPrompt: "graph" }, slotSpec: { ...slotSpec, representationType: "svg_graph" } }],
];

for (const [name, override] of negativeCases) {
  let blocked = false;
  try { buildProductMappingCandidate({ ...base, ...override }); } catch { blocked = true; }
  if (!blocked) throw new Error(`Negative product-mapping case unexpectedly passed: ${name}`);
}

console.log(JSON.stringify({
  status: "passed", route: {
    gradeBand: mapped.productRow.grade_band,
    subject: mapped.productRow.subject,
    branch: mapped.productRow.branch,
  }, negativeCases: negativeCases.map(([name]) => name),
}));
