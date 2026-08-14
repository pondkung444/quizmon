// ตรวจคำหยาบ (ไทย + อังกฤษ) สำหรับช่องพิมพ์อิสระทั้งหมดในระบบ — ตรวจฝั่ง server เท่านั้น
// (client-side ห้ามเป็นด่านตัดสิน เพราะเลี่ยงง่าย — ไฟล์นี้ export containsProfanityLocal แบบ sync
// ล้วนๆ ไม่มี side effect เลยปลอดภัยที่จะ import จาก client component ไปใช้ทำ live validation ได้ด้วย
// แต่ตัวตัดสินจริงต้องมาจาก server action เท่านั้น)

// รายการคำถูกคัดกรองด้วยมือ — เอาเฉพาะคำที่หยาบชัดเจนไม่กำกวม ตัดสรรพนามสามัญ (กู มึง พ่อ แม่ ฯลฯ)
// และคำที่ชนกับคำไทยปกติที่ใช้บ่อย (เช่น "สัตว์"=animal, "กะหรี่"=curry, "แรด"=rhinoceros, "แม่งาน"=
// event lead) ออกทั้งหมด เพื่อกัน false positive กับเนื้อหาเรียน/quiz วิทยาศาสตร์ และชื่อเล่นปกติ
// ถ้าเจอคำที่โดนบล็อกผิดจริงในอนาคต ให้เพิ่มเข้า EXCEPTIONS ด้านล่าง ไม่ต้องแก้ list นี้
const THAI_BAD_WORDS: string[] = [
  "เหี้ย",
  "สัส",
  "ควย",
  "เย็ด",
  "จิ๋ม",
  "แตด",
  "ตอแหล",
  "ระยำ",
  "ดอกทอง",
];

const ENGLISH_BAD_WORDS: string[] = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "whore",
  "slut",
  "nigger",
  "faggot",
  "retard",
  "dumbass",
];

// ชื่อ/คำที่เคยโดนบล็อกผิด (false positive) จริง — เทียบแบบ "ข้อความทั้งหมด (normalize แล้ว) ตรงกันพอดี"
// เติมเพิ่มได้เรื่อยๆ โดยไม่ต้องแตะ wordlist หลักด้านบน
const EXCEPTIONS: string[] = [];

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s​._\-*!@#$%^&()+=[\]{}|\\;:'",.<>/?~`]+/g, "")
    .replace(/(.)\1{2,}/g, "$1");
}

// Layer 1 — wordlist + normalize, sync, ไม่มี network call
export function containsProfanityLocal(text: string): boolean {
  const normalized = normalizeForMatch(text);
  if (!normalized) return false;

  if (EXCEPTIONS.some((exception) => normalizeForMatch(exception) === normalized)) {
    return false;
  }

  return [...THAI_BAD_WORDS, ...ENGLISH_BAD_WORDS].some((word) => normalized.includes(normalizeForMatch(word)));
}

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 3_000;

// Layer 2 — Gemini classify, async, มี fallback เป็น Layer 1 เงียบๆ ถ้า Gemini ล่ม/โควตาหมด
// (เรียกเฉพาะตอน Layer 1 ผ่านแล้วเท่านั้น — ดู checkProfanity ด้านล่าง — ดังนั้น fallback = false
// คือ "เชื่อผล Layer 1 ที่ผ่านไปแล้ว" ตรงตามสเปค ไม่ใช่ fail-open ทิ้งๆ)
export async function containsProfanityAI(text: string): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  const prompt =
    `ข้อความต่อไปนี้มีคำหยาบ คำไม่สุภาพ หรือเนื้อหาไม่เหมาะสมสำหรับนักเรียนหรือไม่ ` +
    `ตอบเป็น JSON เท่านั้น รูปแบบ {"flagged": true} หรือ {"flagged": false} ห้ามมีข้อความอื่นนอกเหนือจาก JSON\n\n` +
    `ข้อความ: """${text}"""`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 20, temperature: 0 },
        }),
        signal: controller.signal,
      }
    );
    if (!res.ok) return false;

    const json = await res.json();
    const responseText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof responseText !== "string") return false;

    const match = responseText.match(/"flagged"\s*:\s*(true|false)/i);
    return match ? match[1].toLowerCase() === "true" : false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// จุดเดียวที่ action เรียกใช้ — เลือก layer ให้อัตโนมัติตาม field
export async function checkProfanity(
  text: string,
  opts: { useAI?: boolean } = {}
): Promise<{ blocked: boolean }> {
  if (containsProfanityLocal(text)) return { blocked: true };
  if (opts.useAI && (await containsProfanityAI(text))) return { blocked: true };
  return { blocked: false };
}
