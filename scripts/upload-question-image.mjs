import path from "node:path";
import process from "node:process";
import { readFile, stat } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "question-images";
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_BY_EXTENSION = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

function usage() {
  console.error("Usage: npm run upload:question-image -- <question-id> <file> [--replace] [--dry-run]");
}

const [questionIdArg, fileArg, ...flags] = process.argv.slice(2);
const replace = flags.includes("--replace");
const dryRun = flags.includes("--dry-run");
if (!questionIdArg || !fileArg || flags.some((flag) => flag !== "--replace" && flag !== "--dry-run")) {
  usage();
  process.exit(2);
}

const questionId = Number(questionIdArg);
if (!Number.isSafeInteger(questionId) || questionId <= 0) {
  throw new Error("question-id must be a positive safe integer");
}

const absoluteFile = path.resolve(fileArg);
const extension = path.extname(absoluteFile).toLowerCase();
const contentType = MIME_BY_EXTENSION.get(extension);
if (!contentType) {
  throw new Error(`Unsupported image extension: ${extension || "(none)"}`);
}

const fileStat = await stat(absoluteFile);
if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_BYTES) {
  throw new Error(`Image must be a non-empty file no larger than ${MAX_BYTES} bytes`);
}

const objectName = `q${questionId}${extension === ".jpeg" ? ".jpg" : extension}`;
if (dryRun) {
  console.log(JSON.stringify({ bucket: BUCKET, objectName, contentType, bytes: fileStat.size, replaced: replace, dryRun }, null, 2));
  process.exit(0);
}

process.loadEnvFile(path.resolve(".env.local"));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: question, error: questionError } = await supabase
  .from("questions")
  .select("id")
  .eq("id", questionId)
  .maybeSingle();
if (questionError) throw questionError;
if (!question) throw new Error(`Question ${questionId} does not exist`);

const body = await readFile(absoluteFile);
const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, body, {
  contentType,
  cacheControl: "3600",
  upsert: replace,
});
if (uploadError) throw uploadError;

const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(objectName);
console.log(JSON.stringify({ bucket: BUCKET, objectName, publicUrl: publicUrl.publicUrl, replaced: replace }, null, 2));
