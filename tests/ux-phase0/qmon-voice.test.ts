import assert from "node:assert/strict";
import { test } from "node:test";
import { PERSONALITY_MESSAGES } from "../../src/lib/personalityMessages.ts";
import { PERSONALITY_QUESTIONS } from "../../src/lib/personalityQuestions.ts";

// เสียงน้อง (IP Bible v0.2): แทนตัวว่า "เรา" · ห้าม ข้า/เจ้า/หนู/คุณ/เธอ/ท่าน · ไม่ใช้ emoji · ฟองยาวไม่เกิน 60 ตัวอักษร
// (วัดที่ 360px: SpeechBubble / .sd-bubble ได้ ~64 ตัวอักษรใน 2 บรรทัด — ดู .oil-ui/qmon-voice/survey.md ข้อ 5)

// ภาษาไทยไม่มีช่องว่างระหว่างคำ — ตัดคำที่มีตัวอักษรชุดนี้ซ้อนอยู่ทิ้ง (เข้า/ข้าง/ข้าว/ข้าม · เจ้าของ/เจ้าหน้าที่ ·
// คุณค่า/คุณภาพ/คุณสมบัติ · ขอบคุณ) และไม่นับเมื่อถูกตามด้วยสระ/วรรณยุกต์ (เช่น "ท่านี้" = ท่า+นี้ มี "ท่าน" ซ้อน)
const PRONOUN = /(?<!เ)ข้า(?![งวมศ])|เจ้า(?!ของ|หน้าที่)|หนู|(?<!ขอบ)คุณ(?!ค่า|ภาพ|สมบัติ)|เธอ|ท่าน/gu;
const COMBINING = /[ัิ-ฺ็-๎]/u;

function pronounsIn(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(PRONOUN)) {
    const next = text[m.index + m[0].length] ?? "";
    if (!COMBINING.test(next)) hits.push(m[0]);
  }
  return hits;
}

const EMOJI = /\p{Extended_Pictographic}/u;
const MAX_LEN = 60;

// จำนวนประโยคต่อ (event, ชุด) — ต้องเท่าเดิม (แก้คำได้ ห้ามเพิ่ม/ลด)
const EXPECTED_COUNTS: Record<string, Record<string, number>> = {
  enterGame: { stage2: 3, math: 3, science: 3, balance: 3 },
  tapQmon: { stage2: 3, math: 2, science: 2, balance: 2 },
  combo3: { stage2: 2, math: 2, science: 2, balance: 2 },
  combo5: { stage2: 2, math: 2, science: 2, balance: 2 },
  combo8: { stage2: 2, math: 2, science: 2, balance: 2 },
  gainExp: { stage2: 2, math: 2, science: 2, balance: 2 },
  nearEvolution: { stage2: 2, math: 2, science: 2, balance: 2 },
  comeback: { stage2: 1, math: 1, science: 1, balance: 1 },
  idle: { stage2: 3, math: 3, science: 3, balance: 3 },
  random: { stage2: 5, math: 5, science: 5, balance: 5 },
};

const messageEntries = Object.entries(PERSONALITY_MESSAGES).flatMap(([event, sets]) =>
  Object.entries(sets).flatMap(([key, lines]) => lines.map((text) => ({ where: `${event}.${key}`, text })))
);

const questionEntries = PERSONALITY_QUESTIONS.flatMap((q) => [
  { where: `${q.id}.prompt`, text: q.prompt.replaceAll("{speciesName}", "") },
  { where: `${q.id}.choiceA`, text: q.choiceA },
  { where: `${q.id}.choiceB`, text: q.choiceB },
]);

test("ตัวตรวจสรรพนามไม่ให้ false positive กับคำที่มีตัวอักษรซ้อน", () => {
  for (const ok of ["ท่านี้", "เข้าใจ", "ข้างหน้า", "ข้าวปั้น", "ข้ามไป", "เจ้าของ", "คุณค่า", "คุณภาพ", "ขอบคุณนะ"]) {
    assert.deepEqual(pronounsIn(ok), [], ok);
  }
  for (const bad of ["เรียกข้าเหรอ", "เจ้ามาแล้ว", "หนูดีใจ", "คุณมาแล้ว", "เธอเก่ง", "ท่านมาแล้ว"]) {
    assert.ok(pronounsIn(bad).length > 0, bad);
  }
});

test("personalityMessages: ไม่มีสรรพนามต้องห้าม", () => {
  const bad = messageEntries.filter((e) => pronounsIn(e.text).length > 0);
  assert.deepEqual(bad, []);
});

test("personalityMessages: ไม่มี emoji", () => {
  assert.deepEqual(messageEntries.filter((e) => EMOJI.test(e.text)), []);
});

test(`personalityMessages: ยาวไม่เกิน ${MAX_LEN} ตัวอักษร`, () => {
  assert.deepEqual(messageEntries.filter((e) => e.text.length > MAX_LEN), []);
});

test("personalityMessages: จำนวนประโยคต่อ (event, ชุด) เท่าเดิม", () => {
  const counts = Object.fromEntries(
    Object.entries(PERSONALITY_MESSAGES).map(([event, sets]) => [
      event,
      Object.fromEntries(Object.entries(sets).map(([key, lines]) => [key, lines.length])),
    ])
  );
  assert.deepEqual(counts, EXPECTED_COUNTS);
});

test("personalityQuestions: ไม่มีสรรพนามต้องห้าม (รวม 'เจ้า' นำหน้าชื่อสัตว์) และไม่มี emoji", () => {
  assert.deepEqual(questionEntries.filter((e) => pronounsIn(e.text).length > 0), []);
  assert.deepEqual(questionEntries.filter((e) => EMOJI.test(e.text)), []);
  assert.equal(PERSONALITY_QUESTIONS.length, 4);
});

test(`personalityQuestions: ยาวไม่เกิน ${MAX_LEN} ตัวอักษร (ไม่นับชื่อสายพันธุ์)`, () => {
  assert.deepEqual(questionEntries.filter((e) => e.text.length > MAX_LEN), []);
});
