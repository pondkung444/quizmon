// Import คำถามจากไฟล์ markdown ใน ./question เข้าตาราง public.questions บน Supabase
//
// Dry-run (แค่ parse + สรุปจำนวน ไม่ insert):
//   node scripts/import-questions.mjs
//
// Insert จริง (หลังเช็คตัวเลขจาก dry-run แล้วว่าถูกต้อง):
//   node scripts/import-questions.mjs --insert

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

process.loadEnvFile(path.join(ROOT, ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ขาด NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน .env.local");
  process.exit(1);
}

const QUESTION_DIR = path.join(ROOT, "question");

// ไฟล์นี้เป็นชุดร่าง 30 ข้อ ที่ id ทุกข้อซ้ำกับ sci-atmosphere-climate-full-50.md (เวอร์ชันเต็มที่แทนที่แล้ว) จึงข้ามไม่ import
const EXCLUDED_FILES = new Set(["sci-atmosphere-climate-full-30.md"]);

const LETTER_TO_INDEX = { ก: 0, ข: 1, ค: 2, ง: 3 };

const Q_HEADER_RE = /^\*\*(Q\d+\.\d+)\*\*/;
const CATEGORY_RE = /^##\s*หมวด:\s*(.+?)\s*\(/;
const LEVEL_RE = /^##\s*ระดับ\s*(\d+)/;
const CHOICES_RE =
  /^-\s*ก\.\s*(.+?)\s*\|\s*ข\.\s*(.+?)\s*\|\s*ค\.\s*(.+?)\s*\|\s*ง\.\s*(.+)$/;
const ANSWER_RE = /^เฉลย:\s*([กขคง])\s*$/;
const EXPLANATION_RE = /^คำอธิบาย:\s*(.+)$/;

function subjectFromFilename(filename) {
  if (filename.startsWith("math-")) return "math";
  if (filename.startsWith("sci-")) return "science";
  throw new Error(`ไม่รู้จัก subject ของไฟล์ ${filename} (ชื่อไฟล์ต้องขึ้นต้นด้วย math- หรือ sci-)`);
}

function expectedCountFromFilename(filename) {
  const m = filename.match(/full-(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseFile(filename) {
  const raw = fs.readFileSync(path.join(QUESTION_DIR, filename), "utf-8");
  const lines = raw.split(/\r?\n/);

  const subject = subjectFromFilename(filename);
  let category = null;
  let difficulty = 1;
  const questions = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (category === null) {
      const catMatch = line.match(CATEGORY_RE);
      if (catMatch) category = catMatch[1].trim();
    }

    const levelMatch = line.match(LEVEL_RE);
    if (levelMatch) difficulty = Number(levelMatch[1]);

    const qMatch = line.match(Q_HEADER_RE);
    if (!qMatch) continue;

    const label = qMatch[1];
    const questionText = (lines[i + 1] ?? "").trim();
    const choicesLine = (lines[i + 2] ?? "").trim();
    const answerLine = (lines[i + 3] ?? "").trim();
    const explanationLine = (lines[i + 4] ?? "").trim();

    const choicesMatch = choicesLine.match(CHOICES_RE);
    const answerMatch = answerLine.match(ANSWER_RE);

    if (!questionText || !choicesMatch || !answerMatch) {
      errors.push(`${label}: parse ไม่ผ่านที่บรรทัด ${i + 1}`);
      continue;
    }

    const choices = choicesMatch.slice(1, 5).map((c) => c.trim());
    const correctIndex = LETTER_TO_INDEX[answerMatch[1]];
    const explanationMatch = explanationLine.match(EXPLANATION_RE);

    questions.push({
      subject,
      category,
      difficulty,
      question_text: questionText,
      choices,
      correct_index: correctIndex,
      explanation: explanationMatch ? explanationMatch[1].trim() : null,
    });
  }

  return { questions, errors };
}

function loadAllFiles() {
  const files = fs
    .readdirSync(QUESTION_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !EXCLUDED_FILES.has(f))
    .sort();

  return files.map((filename) => {
    const { questions, errors } = parseFile(filename);
    return { filename, expected: expectedCountFromFilename(filename), questions, errors };
  });
}

function printSummary(parsedFiles) {
  console.log("สรุปผลการ parse:\n");
  let total = 0;
  let totalErrors = 0;

  for (const { filename, expected, questions, errors } of parsedFiles) {
    total += questions.length;
    totalErrors += errors.length;
    const mismatch = expected !== null && expected !== questions.length;
    const flag = mismatch ? "  ⚠️ ไม่ตรงกับชื่อไฟล์!" : "";
    console.log(
      `  ${filename.padEnd(42)} parsed=${String(questions.length).padStart(3)}` +
        (expected !== null ? `  expected=${expected}` : "") +
        flag
    );
    for (const err of errors) console.log(`      ! ${err}`);
  }

  console.log(`\nรวมทั้งหมด: ${total} ข้อ จาก ${parsedFiles.length} ไฟล์`);
  if (EXCLUDED_FILES.size > 0) {
    console.log(`(ข้ามไฟล์: ${[...EXCLUDED_FILES].join(", ")} — เนื้อหาซ้ำกับไฟล์ full-50 เวอร์ชันใหม่กว่า)`);
  }
  if (totalErrors > 0) {
    console.log(`\n⚠️  พบ ${totalErrors} ข้อที่ parse ไม่ผ่าน ตรวจสอบด้านบนก่อน insert จริง`);
  }

  return { total, totalErrors };
}

async function fetchExistingQuestionTexts(supabase) {
  const existing = new Set();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("questions")
      .select("question_text")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`อ่านข้อมูลเดิมจาก Supabase ไม่สำเร็จ: ${error.message}`);

    for (const row of data) existing.add(row.question_text);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return existing;
}

async function insertQuestions(parsedFiles) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("\nกำลังตรวจสอบคำถามที่มีอยู่แล้วในตาราง questions ...");
  const existing = await fetchExistingQuestionTexts(supabase);
  console.log(`พบคำถามเดิมในตาราง: ${existing.size} ข้อ`);

  const toInsert = [];
  const seenInThisRun = new Set();
  let skipped = 0;

  for (const { questions } of parsedFiles) {
    for (const q of questions) {
      if (existing.has(q.question_text) || seenInThisRun.has(q.question_text)) {
        skipped++;
        continue;
      }
      seenInThisRun.add(q.question_text);
      toInsert.push(q);
    }
  }

  console.log(`ข้อที่มีอยู่แล้ว/ซ้ำกัน: ${skipped} ข้อ (ข้าม)`);
  console.log(`ข้อใหม่ที่จะ insert: ${toInsert.length} ข้อ`);

  if (toInsert.length === 0) {
    console.log("ไม่มีข้อใหม่ต้อง insert");
    return;
  }

  const chunkSize = 200;
  let inserted = 0;

  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from("questions").insert(chunk);
    if (error) throw new Error(`insert ไม่สำเร็จที่ chunk เริ่ม index ${i}: ${error.message}`);
    inserted += chunk.length;
    console.log(`  insert แล้ว ${inserted}/${toInsert.length}`);
  }

  console.log(`\nเสร็จสิ้น: insert ไปทั้งหมด ${inserted} ข้อ`);
}

async function main() {
  const shouldInsert = process.argv.includes("--insert");

  const parsedFiles = loadAllFiles();
  const { totalErrors } = printSummary(parsedFiles);

  if (totalErrors > 0) {
    console.error("\nพบข้อผิดพลาดตอน parse — แก้ไขไฟล์ต้นทางหรือ parser ก่อน insert จริง");
    process.exit(1);
  }

  if (!shouldInsert) {
    console.log("\n(นี่คือ dry-run เท่านั้น ยังไม่ insert ข้อมูลใดๆ)");
    console.log("ถ้าตัวเลขด้านบนถูกต้องแล้ว รันอีกครั้งด้วย: node scripts/import-questions.mjs --insert");
    return;
  }

  await insertQuestions(parsedFiles);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("เกิดข้อผิดพลาด:", err.message);
    process.exit(1);
  });
}

export { loadAllFiles, parseFile };
