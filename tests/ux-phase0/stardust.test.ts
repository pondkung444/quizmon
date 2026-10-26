import assert from "node:assert/strict";
import { test } from "node:test";
import {
  eggIntroKey,
  markEggIntroSeen,
  readEggIntroSeen,
  buildStarStates,
  CONSTELLATIONS,
  countLit,
  roundStreak,
  constellationPoints,
  eggCracks,
  eggCracksBefore,
  elementFromSpritePrefix,
  EGG_HATCH_ANSWERS,
  pickQmonLine,
  stageGrowth,
  STARDUST_TEXT,
} from "../../src/lib/stardust.ts";

test("ครบ 5 ถูก: ดาวติดทุกดวง เส้นติดทุกช่วง", () => {
  const { stars, links } = buildStarStates([true, true, true, true, true], 5, 5);
  assert.deepEqual(stars, ["lit", "lit", "lit", "lit", "lit"]);
  assert.deepEqual(links, ["lit", "lit", "lit", "lit"]);
});

test("ผิดสลับ: ไม่มีเส้นติดเลย ดาวผิดเป็นเส้นประ", () => {
  const { stars, links } = buildStarStates([true, false, true, false, true], 5, 5);
  assert.deepEqual(stars, ["lit", "soft", "lit", "soft", "lit"]);
  assert.deepEqual(links, ["soft", "soft", "soft", "soft"]);
});

test("ผิดหมด", () => {
  const { stars, links } = buildStarStates([false, false, false, false, false], 5, 5);
  assert.deepEqual(stars, Array(5).fill("soft"));
  assert.deepEqual(links, Array(4).fill("soft"));
});

test("กลางรอบ: ข้อปัจจุบันเป็น now ที่เหลือ todo", () => {
  const { stars, links } = buildStarStates([true, true], 5, 2);
  assert.deepEqual(stars, ["lit", "lit", "now", "todo", "todo"]);
  assert.deepEqual(links, ["lit", "todo", "todo", "todo"]);
});

const line = (o: { correct: boolean; streak: number; roundAllCorrect?: boolean; index?: number }) =>
  pickQmonLine({ isEgg: false, cracksLeft: 0, roundAllCorrect: false, ...o });

test("คอมโบในรอบ 3 / 5 / 8 ได้ประโยคคอมโบ · ไม่แตะพอดีได้ประโยคถูกปกติ", () => {
  assert.equal(line({ correct: true, streak: 3 }), STARDUST_TEXT.say.combo3);
  assert.equal(line({ correct: true, streak: 5 }), STARDUST_TEXT.say.combo5Streak);
  assert.equal(line({ correct: true, streak: 8 }), STARDUST_TEXT.say.combo8);
  assert.ok((STARDUST_TEXT.say.ok as readonly string[]).includes(line({ correct: true, streak: 4, index: 1 })));
  assert.equal(line({ correct: false, streak: 0 }), STARDUST_TEXT.say.miss);
});

test("ครบทุกดวงขึ้นเฉพาะข้อสุดท้ายที่ถูกทุกข้อของรอบ", () => {
  const results = [true, true, true, true, true];
  assert.equal(roundStreak(results), 5);
  assert.equal(line({ correct: true, streak: 5, roundAllCorrect: true }), STARDUST_TEXT.say.comboAll);
  // ภารกิจ 8 ข้อ ถูกติดกัน 5 แต่ยังไม่จบรอบ → ประโยคคอมโบ 5 ไม่ใช่ "ครบทุกดวง"
  assert.notEqual(line({ correct: true, streak: 5 }), STARDUST_TEXT.say.comboAll);
});

test("คอมโบข้ามรอบ: server combo = 4 ตอนเริ่ม ข้อแรกของรอบถูก → ไม่ขึ้นประโยคคอมโบ", () => {
  // ประโยคใช้ผลบนจอของรอบนี้เท่านั้น (server combo 4+1 = 5 ไม่เกี่ยว)
  const streak = roundStreak([true]);
  assert.equal(streak, 1);
  const said = line({ correct: true, streak, index: 0 });
  assert.notEqual(said, STARDUST_TEXT.say.combo5Streak);
  assert.notEqual(said, STARDUST_TEXT.say.comboAll);
  assert.equal(said, STARDUST_TEXT.say.ok[0]);
});

test("ไข่: เกณฑ์ฟัก 5 ข้อ รอยร้าวจำกัดที่ 5", () => {
  assert.equal(EGG_HATCH_ANSWERS, 5);
  assert.equal(eggCracksBefore(0), 0);
  assert.equal(eggCracksBefore(20), 2);
  assert.equal(eggCracksBefore(50), 5);
  assert.equal(eggCracks(3, 4), 5);
  assert.equal(eggCracks(1, 2), 3);
  assert.equal(pickQmonLine({ isEgg: true, correct: true, streak: 3, roundAllCorrect: false, cracksLeft: 2 }), "ไข่ร้าวอีกนิดแล้ว อีก 2 ข้อเราจะตื่น");
  assert.equal(pickQmonLine({ isEgg: true, correct: false, streak: 0, roundAllCorrect: false, cracksLeft: 2 }), STARDUST_TEXT.say.eggMiss);
});

test("จำนวนข้อ 3", () => {
  const { stars, links } = buildStarStates([true, true, false], 3, 3);
  assert.deepEqual(stars, ["lit", "lit", "soft"]);
  assert.deepEqual(links, ["lit", "soft"]);
  assert.equal(constellationPoints("wood", 3).length, 3);
});

test("จำนวนข้อ 8 + ภารกิจทำต่อ prior=3: ข้อก่อนหน้าเป็น done-prior ไม่มีเส้นแตะ ไม่นับดวง", () => {
  const round = [true, true];
  const { stars, links } = buildStarStates(round, 8, 5, 3);
  assert.deepEqual(stars, ["done-prior", "done-prior", "done-prior", "lit", "lit", "now", "todo", "todo"]);
  // เส้น 1–2, 2–3, 3–4 แตะข้อก่อนหน้า → none · 4–5 ถูกทั้งคู่ → lit
  assert.deepEqual(links, ["none", "none", "none", "lit", "todo", "todo", "todo"]);
  assert.equal(countLit(round), 2);
  assert.equal(STARDUST_TEXT.stripLabelPrior(6, 8, countLit(round)), "ข้อ 6 จาก 8 · รอบนี้เก็บประกายดาวได้ 2 ดวง");
  const pts = constellationPoints("fire", 8);
  assert.equal(pts.length, 8);
  assert.deepEqual(pts[0], [32, 92]);
  assert.deepEqual(pts[7], [68, 92]);
});

test("กลุ่มดาว 6 ธาตุไม่ซ้ำกัน · ธราเส้นฐานแนวนอน", () => {
  const keys = ["fire", "wood", "water", "sky", "earth", "divine"] as const;
  const shapes = keys.map((k) => JSON.stringify(CONSTELLATIONS[k]));
  assert.equal(new Set(shapes).size, 6);
  const e = CONSTELLATIONS.earth;
  assert.ok(e.slice(1).some((p, i) => p[1] === e[i][1] && Math.abs(p[0] - e[i][0]) >= 60));
});

test("ธาตุจาก sprite_prefix + fallback", () => {
  assert.equal(elementFromSpritePrefix("egg1"), "fire");
  assert.equal(elementFromSpritePrefix("egg2"), "wood");
  assert.equal(elementFromSpritePrefix("eggX"), "neutral");
  assert.equal(elementFromSpritePrefix(null), "neutral");
});

test("กล่องการเติบโต: ใช้ threshold จาก evolution.ts", () => {
  const g = stageGrowth(2, 120, 30);
  assert.equal(g.left, 200);
  assert.ok(g.now > g.was);
  assert.equal(stageGrowth(4, 950, 10).left, null);
});

test("ฉากเปิดไข่: อ่าน/เขียนคีย์ต่อไข่ · storage throw = แสดงฉาก ไม่พัง", () => {
  const map = new Map<string, string>();
  const ok = () => ({ getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) });
  assert.equal(eggIntroKey("p1"), "qm:eggIntroSeen:p1");
  assert.equal(readEggIntroSeen(ok, "p1"), false);
  markEggIntroSeen(ok, "p1");
  assert.equal(readEggIntroSeen(ok, "p1"), true);
  assert.equal(readEggIntroSeen(ok, "p2"), false);

  const accessThrows = () => {
    throw new Error("SecurityError");
  };
  assert.equal(readEggIntroSeen(accessThrows, "p1"), false);
  assert.doesNotThrow(() => markEggIntroSeen(accessThrows, "p1"));

  const methodsThrow = () => ({
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  });
  assert.equal(readEggIntroSeen(methodsThrow, "p1"), false);
  assert.doesNotThrow(() => markEggIntroSeen(methodsThrow, "p1"));
});
