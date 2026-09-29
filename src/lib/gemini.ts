// เดิมใช้ "gemini-1.5-flash" ตรงๆ — เจอตอนทดสอบจริงว่า Google เลิกรองรับโมเดลนี้ไปแล้ว (404
// ทุกครั้ง แปลว่าตลอดมา flow นี้ fallback ไป template เงียบๆ ไม่เคยเรียก Gemini สำเร็จจริงเลย)
// เปลี่ยนมาใช้ alias "-latest" แทนการ pin ชื่อรุ่นตรงๆ เพื่อกันบั๊กคลาสเดียวกันเกิดซ้ำอนาคต (ตอนนี้
// resolve ไปที่ gemini-3.6-flash) — คีย์นี้เจอด้วยว่า gemini-2.5-flash/2.5-flash-lite ไม่รองรับ
// ผู้ใช้ใหม่แล้ว และ gemini-2.0-* ทุกตัวติด quota (429) กับคีย์นี้โดยเฉพาะ มีแค่ "-latest" ที่ใช้ได้จริง
export const GEMINI_MODEL = "gemini-flash-latest";
// deploy ปัจจุบัน (2026-07) ยังเป็น Vercel serverless function — 8s เผื่อ margin ไว้ก่อนชน
// function timeout ของแผนที่ใช้อยู่ ถ้าย้ายไป Railway (ไม่มีข้อจำกัดนี้) ค่อยยืดได้
const GEMINI_TIMEOUT_MS = 8_000;

export async function callGemini(
  prompt: string,
  opts: { timeoutMs?: number; maxOutputTokens?: number; temperature?: number } = {}
): Promise<string> {
  const { timeoutMs = GEMINI_TIMEOUT_MS, maxOutputTokens = 1000, temperature = 0.9 } = opts;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ไม่ได้ตั้งค่า");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          // 1000 ไม่ใช่งบสำหรับข้อความที่โชว์จริง (สั้นแค่ 1-2 ประโยค) — gemini-flash-latest
          // เป็นโมเดลที่ "คิด" ก่อนตอบเสมอ (thoughtsTokenCount กินงบ maxOutputTokens ไปด้วย)
          // ทดสอบจริงพบว่ากิน ~450-650 tokens ไปกับการคิดก่อนจะเริ่มพิมพ์คำตอบ ถ้าตั้งงบต่ำ (เช่น
          // 200 เดิม) จะโดนตัดกลางคันตอนกำลังคิดพอดี (finishReason=MAX_TOKENS, content ว่างเปล่า
          // ไม่มีข้อความเลย) ตั้ง 1000 ให้เหลือพอหลังคิดเสร็จ ยืนยันจากการยิงจริง 3 รอบ finishReason
          // ออกมาเป็น STOP (จบตามธรรมชาติ) ทุกครั้ง ไม่ใช่ MAX_TOKENS
          generationConfig: { maxOutputTokens, temperature },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Gemini ไม่ตอบข้อความกลับมา");
    }

    return text.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}
