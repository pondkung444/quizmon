// Import คำถามพันธุศาสตร์ (เมนเดล) จาก question/sci-genetics-mendelian-full-100.md เข้าตาราง public.questions
//
// รูปแบบไฟล์ต้นทางเหมือน import-inequality-factoring.mjs (### ID / - หมวด / - คำถาม /
// - ตัวเลือก A-D / - เฉลย / - คำอธิบาย) แต่ "หมวด" ต่อข้อในไฟล์นี้เป็นหมวดย่อยเพื่อการอ้างอิง
// เท่านั้น — ตามธรรมเนียมไฟล์ sci-*.md อื่นๆ ทุกไฟล์ใช้ category เดียวต่อทั้งไฟล์ จึงบังคับ
// category ของทุกแถวให้ตรงกับ sci-genetics-full-50.md (ไฟล์พันธุศาสตร์เดิม) แทนการใช้หมวดย่อย
// และบังคับ difficulty = 1 ทุกข้อเช่นเดียวกับ import-inequality-factoring.mjs
//
// Dry-run (แค่ parse + สรุปจำนวน ไม่ insert):
//   node scripts/import-genetics-mendelian.mjs
//
// Insert จริง:
//   node scripts/import-genetics-mendelian.mjs --insert

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

const SOURCE_FILE = path.join(ROOT, "question", "sci-genetics-mendelian-full-100.md");

// ตรงกับค่า category จริงที่ import-questions.mjs เขียนลง DB จาก question/sci-genetics-full-50.md
// (regex ของสคริปต์นั้นตัดส่วน "(วิทยาศาสตร์ ม.3)" ท้ายบรรทัด "## หมวด:" ทิ้งไปแล้ว)
const FIXED_CATEGORY = "พันธุกรรมและเซลล์สืบพันธุ์";

const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3 };

function parseSourceFile() {
  const raw = fs.readFileSync(SOURCE_FILE, "utf-8");
  const blocks = raw.split(/^### /m).slice(1).map((b) => "### " + b);

  const questions = [];
  const errors = [];

  for (const block of blocks) {
    const idMatch = block.match(/^### (\S+)/);
    const id = idMatch ? idMatch[1] : "(ไม่ทราบ id)";

    const questionMatch = block.match(/- คำถาม: (.+)/);
    const choiceMatches = [...block.matchAll(/- ([A-D])\) (.+)/g)];
    const answerMatch = block.match(/- เฉลย: ([A-D])/);
    const explanationMatch = block.match(/- คำอธิบาย: (.+)/);

    if (!questionMatch || choiceMatches.length !== 4 || !answerMatch || !explanationMatch) {
      errors.push(`${id}: parse ไม่ผ่าน (ขาด field ใดฟิลด์หนึ่ง)`);
      continue;
    }

    questions.push({
      subject: "science",
      category: FIXED_CATEGORY,
      difficulty: 1,
      question_text: questionMatch[1].trim(),
      choices: choiceMatches.map((m) => m[2].trim()),
      correct_index: LETTER_TO_INDEX[answerMatch[1]],
      explanation: explanationMatch[1].trim(),
    });
  }

  return { questions, errors };
}

function printSummary(questions, errors) {
  console.log("สรุปผลการ parse:\n");
  console.log(`  parsed = ${questions.length} ข้อ`);
  console.log(`  category ที่ใช้ (ค่าเดียวทั้งไฟล์): ${FIXED_CATEGORY}`);
  if (errors.length > 0) {
    console.log(`\n⚠️  พบ ${errors.length} ข้อที่ parse ไม่ผ่าน:`);
    for (const err of errors) console.log(`      ! ${err}`);
  }
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

async function insertQuestions(questions) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("\nกำลังตรวจสอบคำถามที่มีอยู่แล้วในตาราง questions ...");
  const existing = await fetchExistingQuestionTexts(supabase);
  console.log(`พบคำถามเดิมในตาราง: ${existing.size} ข้อ`);

  const toInsert = [];
  const seenInThisRun = new Set();
  let skipped = 0;

  for (const q of questions) {
    if (existing.has(q.question_text) || seenInThisRun.has(q.question_text)) {
      skipped++;
      continue;
    }
    seenInThisRun.add(q.question_text);
    toInsert.push(q);
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

  const { questions, errors } = parseSourceFile();
  printSummary(questions, errors);

  if (errors.length > 0) {
    console.error("\nพบข้อผิดพลาดตอน parse — แก้ไขไฟล์ต้นทางหรือ parser ก่อน insert จริง");
    process.exit(1);
  }

  if (!shouldInsert) {
    console.log("\n(นี่คือ dry-run เท่านั้น ยังไม่ insert ข้อมูลใดๆ)");
    console.log("ถ้าตัวเลขด้านบนถูกต้องแล้ว รันอีกครั้งด้วย: node scripts/import-genetics-mendelian.mjs --insert");
    return;
  }

  await insertQuestions(questions);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("เกิดข้อผิดพลาด:", err.message);
    process.exit(1);
  });
}
