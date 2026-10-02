import { buildProductMappingCandidate } from "../src/lib/questionFactory/productMapping.ts";
import {
  buildQuestionFactoryScopeKey,
  parseQuestionFactoryScopeKey,
} from "../src/lib/questionFactory/scopeKey.ts";
import { factoryCurriculumRoute } from "../src/lib/questionFactory/curriculumChapter.ts";

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
  chapterKey: chapter.curriculumChapterKey,
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

// Primary (ป.4–6): stage=primary ↔ grade_band=primary ↔ grade 4|5|6, gradeLevel ป.{grade}, branch null
const primaryCases = [
  ["primary-math", "math", 5, "ป.5", "ป.5 — เศษส่วน"],
  ["primary-science", "science", 4, "ป.4", "ป.4 — สารรอบตัว"],
];
for (const [name, subject, grade, gradeLevel, category] of primaryCases) {
  const pChapter = {
    ...chapter, curriculumChapterKey: "cc_bbbbbbbbbbbbbbbbbbbbbbbb", gradeBand: "primary", gradeLevel,
    gradeOrder: grade, factorySubject: subject, productSubject: subject, productBranch: null,
    subjectLabel: subject === "math" ? "คณิตศาสตร์" : "วิทยาศาสตร์", chapter: "บททดสอบ",
  };
  const pMapping = {
    ...categoryMapping, chapterKey: pChapter.curriculumChapterKey, stage: "primary", subject,
    topicId: "pt_test", gradeBand: "primary", productSubject: subject, branch: null, category,
  };
  const pBase = {
    stage: "primary", grade, subject, slotSpec: { ...slotSpec, topic: "pt_test" },
    question: { ...question, topic: "pt_test" }, chapter: pChapter, categoryMapping: pMapping, approvedAsset: null,
  };
  const row = buildProductMappingCandidate(pBase).productRow;
  if (row.grade_band !== "primary" || row.grade_level !== gradeLevel || row.subject !== subject || row.branch !== null) {
    throw new Error(`Primary route was not produced: ${name}`);
  }
  const route = factoryCurriculumRoute({ stage: "primary", grade, subject });
  if (route.gradeBand !== "primary" || route.gradeLevel !== gradeLevel) throw new Error(`Primary route lookup failed: ${name}`);
  const key = buildQuestionFactoryScopeKey({ stage: "primary", grade, subject, unit: pChapter.curriculumChapterKey });
  if (key !== `qf:v1|stage=primary|grade=${grade}|subject=${subject}|unit=cc_bbbbbbbbbbbbbbbbbbbbbbbb`) {
    throw new Error(`Primary scope key is not canonical: ${name}`);
  }
  if (parseQuestionFactoryScopeKey(key).stage !== "primary") throw new Error(`Primary scope key did not round-trip: ${name}`);
  for (const [bad, override] of [
    ["wrong-grade", { grade: grade === 4 ? 5 : 4 }],
    ["junior-mapping", { categoryMapping: { ...pMapping, gradeBand: "junior" } }],
    ["branch-set", { categoryMapping: { ...pMapping, branch: "physics" } }],
    ["wrong-chapter-band", { chapter: { ...pChapter, gradeBand: "junior" } }],
  ]) {
    let blocked = false;
    try { buildProductMappingCandidate({ ...pBase, ...override }); } catch { blocked = true; }
    if (!blocked) throw new Error(`Negative primary case unexpectedly passed: ${name}/${bad}`);
  }
}

// ผิดคู่ stage/grade/subject ต้องถูกปฏิเสธทั้งตอน build และ parse
const badScopes = [
  { stage: "primary", grade: 7, subject: "math" },
  { stage: "primary", grade: 3, subject: "math" },
  { stage: "primary", grade: 5, subject: "physics" },
  { stage: "lower_secondary", grade: 5, subject: "math" },
  { stage: "upper_secondary", grade: 6, subject: "physics" },
];
for (const s of badScopes) {
  let blocked = false;
  try { buildQuestionFactoryScopeKey({ ...s, unit: "x" }); } catch { blocked = true; }
  if (!blocked) throw new Error(`Mismatched scope unexpectedly built: ${JSON.stringify(s)}`);
  blocked = false;
  try { parseQuestionFactoryScopeKey(`qf:v1|stage=${s.stage}|grade=${s.grade}|subject=${s.subject}|unit=x`); } catch { blocked = true; }
  if (!blocked) throw new Error(`Mismatched scope key unexpectedly parsed: ${JSON.stringify(s)}`);
}
for (const legacy of [
  "qf:v1|stage=lower_secondary|grade=8|subject=math|unit=cc_2f112e2b7800a4859521b687",
  "qf:v1|stage=upper_secondary|grade=11|subject=physics|unit=x",
]) {
  if (buildQuestionFactoryScopeKey(parseQuestionFactoryScopeKey(legacy)) !== legacy) {
    throw new Error(`Legacy scope key did not round-trip: ${legacy}`);
  }
}

console.log(JSON.stringify({
  status: "passed", route: {
    gradeBand: mapped.productRow.grade_band,
    subject: mapped.productRow.subject,
    branch: mapped.productRow.branch,
  }, negativeCases: negativeCases.map(([name]) => name),
  primary: primaryCases.map(([name]) => name), mismatchedScopes: badScopes.length,
}));
