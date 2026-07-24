import { getPersonalityKey, type PersonalityKey } from "@/lib/personality";
import { PERSONALITY_MESSAGES, type PersonalityEventKey } from "@/lib/personalityMessages";
import type { Personality } from "@/lib/evolution";

export type QmonMenu = "practice" | "progress" | "encourage" | "chat";

// โทนของ PersonalityKey (มาจาก subline) — ใช้ได้ทุก stage เปลี่ยนได้ตลอด (ไม่ใช่ค่า lock)
const PERSONALITY_KEY_TONE_TH: Record<PersonalityKey, string> = {
  stage2: "เด็กน้อยไร้เดียงสา ตื่นเต้นง่าย พูดสั้นๆ น่ารัก ใช้คำอุทาน",
  math: "สายคณิต พูดจาเป็นระบบ ชอบอ้างอิงตัวเลข/สถิติที่ทำได้",
  science: "สายวิทย์ ช่างสงสัย ตื่นเต้นกับการค้นพบและความเปลี่ยนแปลง",
  balance: "สายสมดุล พูดจาสงบ ใจเย็น ให้กำลังใจแบบนุ่มนวล 🌿",
};

// โทนของ pets.personality (A/B) — ผสมเพิ่มเฉพาะ stage >= 4 เท่านั้น (ล็อกแล้วจาก majority vote)
const PERSONALITY_AB_TONE_TH: Record<Personality, string> = {
  A: "ดุดัน กระตือรือร้น ห้าวหาญ ให้กำลังใจแบบท้าทายผลักดัน",
  B: "สุขุม รอบคอบ ใจเย็น ให้กำลังใจแบบนุ่มนวลอบอุ่น",
};

export interface PersonaPetInput {
  stage: number;
  subline: string | null;
  // ก่อน stage 4 ค่านี้ "ยังไม่นิ่ง" (ยังไม่ได้ majority vote) — ฟังก์ชันนี้จะไม่อ่านค่านี้เลย
  // ถ้า stage < 4 ต่อให้ pet.personality มีค่าอยู่แล้วในแถว (เช่นข้อมูลเก่า/แก้มือ) ก็ตาม
  personality: Personality | null;
}

// จุดเดียวที่ตัดสินใจว่าจะผสมโทน personality (A/B) เข้ากับ PersonalityKey หรือไม่
// ห้ามแก้ให้ query/อ่าน pet.personality โดยไม่เช็ค stage >= 4 ก่อน — เป็นบั๊กที่พลาดง่ายที่สุด
export function resolvePersonaTone(pet: PersonaPetInput): string {
  const key = getPersonalityKey(pet.stage, pet.subline);
  const baseTone = PERSONALITY_KEY_TONE_TH[key];

  if (pet.stage < 4) {
    return baseTone;
  }

  if (!pet.personality) {
    return baseTone;
  }

  return `${baseTone} ผสมกับนิสัย${PERSONALITY_AB_TONE_TH[pet.personality]}`;
}

// ข้อความสำรองตอน Gemini ล้มเหลว/timeout — ใช้ pool "random" เดิมที่มีอยู่แล้วใน
// personalityMessages.ts (ของ usePersonalityMessage บนการ์ดสัตว์เลี้ยง) แทนการแต่งคำใหม่
// เลือก key "random" เพราะเป็น pool เดียวที่เป็นข้อความให้กำลังใจทั่วไปไม่ผูกกับ event เฉพาะ
// (enterGame/tapQmon/comboN ฯลฯ ผูกกับสถานการณ์อื่น) — ใช้ร่วมกันทุกเมนู (encourage/practice)
// เพราะ personalityMessages.ts ยังไม่มี event key แยกเฉพาะเมนูไหนเลย ถ้าเจอ key ที่เหมาะกว่า
// ทีหลังค่อยแยก ไม่ใช่ก็อปฟังก์ชันนี้ซ้ำ
// ไม่ใช้ getMessage()/personality.ts เพราะ hook นั้นมี state กันข้อความซ้ำ (lastMessageByEvent)
// เป็น module-level Map ที่ตั้งใจไว้สำหรับ client เดียว ถ้าเรียกจากฝั่ง server จะกลายเป็น state
// ที่แชร์ข้ามผู้ใช้ทุกคนในโปรเซสเดียวกัน — สุ่มตรงจาก pool เองแทน ไม่ต้องมี dedup ก็ได้
//
// eventKey เดิม default "random" (encourage/practice ยังไม่มี key เฉพาะ) — เมนู "ดูพัฒนาการ"
// ส่ง "nearEvolution" แทนตอน primarySignal เป็น evolution เพราะมี pool ที่ตรงบริบทกว่าอยู่แล้ว
export function getFallbackQmonMessage(
  pet: PersonaPetInput,
  eventKey: PersonalityEventKey = "random"
): string {
  const pool = PERSONALITY_MESSAGES[eventKey][getPersonalityKey(pet.stage, pet.subline)];
  return pool[Math.floor(Math.random() * pool.length)];
}

// สร้าง prompt เต็มสำหรับส่งให้ Gemini — เมนู "ขอแรงใจ" (encourage)
// inputSummary ต้องเป็นตัวเลขสรุปล้วนๆ (ดู qmon_messages.input_summary) ห้ามมี PII ของผู้ใช้
export function buildEncouragePrompt(pet: PersonaPetInput, inputSummary: Record<string, unknown>): string {
  const tone = resolvePersonaTone(pet);

  return [
    "คุณคือ Qmon สัตว์เลี้ยงในเกมฝึกทำโจทย์คณิตศาสตร์/วิทยาศาสตร์ของเด็กนักเรียนไทย",
    `บุคลิกของคุณตอนนี้: ${tone}`,
    "หน้าที่: ให้กำลังใจผู้เล่นสั้นๆ อบอุ่น เป็นภาษาไทย ไม่เกิน 2 ประโยค ไม่ใช้คำหยาบหรือทำให้ผู้เล่นรู้สึกแย่",
    "ห้ามให้เฉลยข้อสอบ ห้ามพูดถึงข้อมูลส่วนตัวของผู้เล่น พูดในมุมมองของสัตว์เลี้ยงเท่านั้น",
    `ข้อมูลสรุปผลการฝึกล่าสุดของผู้เล่น (ใช้ประกอบคำพูดเท่านั้น ไม่ต้องอ่านตัวเลขตรงๆ): ${JSON.stringify(inputSummary)}`,
  ].join("\n");
}

// สร้าง prompt เต็มสำหรับส่งให้ Gemini — เมนู "ควรฝึกอะไร" (practice)
// โทนต้อง "ชวนไปฝึก" ไม่ใช่ "ตำหนิ" แม้ pattern จะเป็น confused/careless ก็ตาม — ย้ำในนี้ตรงๆ
export function buildPracticePrompt(pet: PersonaPetInput, inputSummary: Record<string, unknown>): string {
  const tone = resolvePersonaTone(pet);

  return [
    "คุณคือ Qmon สัตว์เลี้ยงในเกมฝึกทำโจทย์คณิตศาสตร์/วิทยาศาสตร์ของเด็กนักเรียนไทย",
    `บุคลิกของคุณตอนนี้: ${tone}`,
    "หน้าที่: ชวนผู้เล่นไปฝึกหมวดที่ควรฝึกต่อ พูดสั้นๆ เป็นภาษาไทย ไม่เกิน 2 ประโยค ฟังดูเหมือนชวนไปผจญภัย/ฝึกด้วยกัน",
    "ห้ามพูดทำนองตำหนิหรือบอกว่าผู้เล่น 'ทำไม่ได้'/'อ่อนเรื่องนี้' — เน้นชวนด้วยความอยากรู้อยากลอง ไม่ตัดสิน",
    "ถ้าข้อมูลบอกว่ายังไม่มีหมวดที่ชัดเจนพอ (weakestCategoryPattern เป็น insufficient_data หรือ weakestCategory เป็น null) ให้ชวนฝึกทั่วไปแบบไม่ระบุหมวด แทนที่จะเดาหมวดเอง",
    "ห้ามให้เฉลยข้อสอบ ห้ามพูดถึงข้อมูลส่วนตัวของผู้เล่น ห้ามพูดคำว่า pattern/threshold/สถิติตรงๆ พูดในมุมมองของสัตว์เลี้ยงเท่านั้น",
    `ข้อมูลสรุปผลการฝึกล่าสุดของผู้เล่น (ใช้ประกอบคำพูดเท่านั้น ไม่ต้องอ่านตัวเลข/ชื่อ field ตรงๆ): ${JSON.stringify(inputSummary)}`,
  ].join("\n");
}

// เมนู "ดูพัฒนาการ" (progress) เลือก "สัญญาณเด่น" ตัวเดียวมาส่งให้ Gemini เสมอ (ตัดสินใจฝั่ง
// เซิร์ฟเวอร์ใน askQmon.ts แล้ว ไม่ส่งทั้ง 3 สัญญาณให้ Gemini เลือกเอง) — "none" = ไม่มีสัญญาณไหน
// เด่นพอ ให้พูดให้กำลังใจทั่วไปแทน
export type ProgressInputSummary =
  | { primarySignal: "evolution"; pctToNextStage: number }
  | { primarySignal: "consistency"; activeDaysLast7: number }
  | { primarySignal: "trend"; accuracyDeltaPct: number }
  | { primarySignal: "none" };

// สร้าง prompt เต็มสำหรับส่งให้ Gemini — เมนู "ดูพัฒนาการ" (progress)
// โทนต้อง "ภูมิใจแทน" ไม่ใช่รายงานผลวิเคราะห์เชิงสถิติ — ย้ำห้ามพูดถึงมิติอื่นที่ไม่ได้ส่งมา
// เพราะ input_summary มีแค่สัญญาณเดียวเสมอ (ดู askQmon.ts) กัน Gemini เดามิติอื่นมาแต่งเติมเอง
export function buildProgressPrompt(pet: PersonaPetInput, inputSummary: ProgressInputSummary): string {
  const tone = resolvePersonaTone(pet);

  if (inputSummary.primarySignal === "none") {
    return [
      "คุณคือ Qmon สัตว์เลี้ยงในเกมฝึกทำโจทย์คณิตศาสตร์/วิทยาศาสตร์ของเด็กนักเรียนไทย",
      `บุคลิกของคุณตอนนี้: ${tone}`,
      "หน้าที่: ให้กำลังใจผู้เล่นทั่วไปแบบภูมิใจในตัวเขา ไม่มีความคืบหน้าตัวเลขใดให้พูดถึงตอนนี้ ห้ามแต่งตัวเลขขึ้นมาเอง",
      "พูดสั้นๆ เป็นภาษาไทย ไม่เกิน 2 ประโยค ฟังดูอบอุ่น ภูมิใจแทนผู้เล่น ไม่ใช่วิเคราะห์ข้อมูล",
      "ห้ามให้เฉลยข้อสอบ ห้ามพูดถึงข้อมูลส่วนตัวของผู้เล่น พูดในมุมมองของสัตว์เลี้ยงเท่านั้น",
    ].join("\n");
  }

  return [
    "คุณคือ Qmon สัตว์เลี้ยงในเกมฝึกทำโจทย์คณิตศาสตร์/วิทยาศาสตร์ของเด็กนักเรียนไทย",
    `บุคลิกของคุณตอนนี้: ${tone}`,
    "หน้าที่: พูดถึงความคืบหน้าของผู้เล่นด้วยความภูมิใจแทนเขา ราวกับสัตว์เลี้ยงที่ดีใจไปกับเจ้าของ ไม่ใช่รายงานผลวิเคราะห์ พูดสั้นๆ เป็นภาษาไทย ไม่เกิน 2 ประโยค",
    "ห้ามพูดถึงมิติ/ความคืบหน้าด้านอื่นนอกจากข้อมูลที่ให้มาด้านล่างนี้เท่านั้น ห้ามเดาหรือแต่งเติมตัวเลข/มิติอื่นขึ้นมาเอง",
    "ห้ามให้เฉลยข้อสอบ ห้ามพูดถึงข้อมูลส่วนตัวของผู้เล่น ห้ามพูดคำว่า threshold/สถิติ/percentile/signal ตรงๆ พูดในมุมมองของสัตว์เลี้ยงเท่านั้น",
    `ข้อมูลความคืบหน้าเด่นล่าสุดของผู้เล่น (ใช้ประกอบคำพูดเท่านั้น ไม่ต้องอ่านตัวเลข/ชื่อ field ตรงๆ): ${JSON.stringify(inputSummary)}`,
  ].join("\n");
}

// สร้าง prompt เต็มสำหรับส่งให้ Gemini — เมนู "คุยเล่นสั้นๆ" (chat)
// เมนูเดียวใน 4 เมนูที่ไม่มี inputSummary จากสถิติใดๆ เลย (ตัดสินใจตอนวางแผนแล้วว่าเมนูนี้เสี่ยง
// สุด เนื้อหาควบคุมยากกว่าเมนูอื่น) ใช้แค่ resolvePersonaTone() เป็นข้อมูลเดียวที่ส่งเข้า Gemini —
// ไม่รับ inputSummary parameter เลยต่างจาก build*Prompt ตัวอื่น เพราะไม่มีอะไรให้ส่งนอกจาก tone
export function buildChatPrompt(pet: PersonaPetInput): string {
  const tone = resolvePersonaTone(pet);

  return [
    "คุณคือ Qmon สัตว์เลี้ยงในเกมฝึกทำโจทย์คณิตศาสตร์/วิทยาศาสตร์ของเด็กนักเรียนไทย",
    `บุคลิกของคุณตอนนี้: ${tone}`,
    "หน้าที่: พูดคุยเล่นสั้นๆ แค่ 1 ประโยค เป็นภาษาไทย ทักทายหรือพูดอะไรน่ารักๆ ทั่วไปตามบุคลิกของคุณ ไม่ต้องมีหัวข้อเฉพาะเจาะจง",
    "ห้ามพูดถึงคะแนน การเรียน ผลการฝึก หรือชวนไปฝึกอะไรเด็ดขาด — เป็นบทพูดคุยเล่นล้วนๆ ไม่เกี่ยวกับการเรียนเลย",
    "ห้ามให้เฉลยข้อสอบ ห้ามพูดถึงข้อมูลส่วนตัวของผู้เล่น พูดในมุมมองของสัตว์เลี้ยงเท่านั้น",
  ].join("\n");
}
