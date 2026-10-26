import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStarStates,
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

test("คอมโบ 3 / 5 / 8 ได้ข้อความคอมโบ · ไม่แตะพอดีได้ข้อความถูกปกติ", () => {
  assert.equal(pickQmonLine({ isEgg: false, correct: true, combo: 3, cracksLeft: 0 }), STARDUST_TEXT.say.combo3);
  assert.equal(pickQmonLine({ isEgg: false, correct: true, combo: 5, cracksLeft: 0 }), STARDUST_TEXT.say.combo5);
  assert.equal(pickQmonLine({ isEgg: false, correct: true, combo: 8, cracksLeft: 0 }), STARDUST_TEXT.say.combo8);
  assert.ok(STARDUST_TEXT.say.ok.includes(pickQmonLine({ isEgg: false, correct: true, combo: 4, cracksLeft: 0, index: 1 }) as never));
  assert.equal(pickQmonLine({ isEgg: false, correct: false, combo: 0, cracksLeft: 0 }), STARDUST_TEXT.say.miss);
});

test("ไข่: เกณฑ์ฟัก 5 ข้อ รอยร้าวจำกัดที่ 5", () => {
  assert.equal(EGG_HATCH_ANSWERS, 5);
  assert.equal(eggCracksBefore(0), 0);
  assert.equal(eggCracksBefore(20), 2);
  assert.equal(eggCracksBefore(50), 5);
  assert.equal(eggCracks(3, 4), 5);
  assert.equal(eggCracks(1, 2), 3);
  assert.equal(pickQmonLine({ isEgg: true, correct: true, combo: 3, cracksLeft: 2 }), "ไข่ร้าวอีกนิดแล้ว อีก 2 ข้อเราจะตื่น");
  assert.equal(pickQmonLine({ isEgg: true, correct: false, combo: 0, cracksLeft: 2 }), STARDUST_TEXT.say.eggMiss);
});

test("จำนวนข้อ 3", () => {
  const { stars, links } = buildStarStates([true, true, false], 3, 3);
  assert.deepEqual(stars, ["lit", "lit", "soft"]);
  assert.deepEqual(links, ["lit", "soft"]);
  assert.equal(constellationPoints("wood", 3).length, 3);
});

test("จำนวนข้อ 8 + ภารกิจทำต่อ (3 ข้อก่อนหน้าไม่รู้ผล → ดาวติด ไม่มีเส้น)", () => {
  const { stars, links } = buildStarStates([true, true], 8, 5, 3);
  assert.deepEqual(stars, ["lit", "lit", "lit", "lit", "lit", "now", "todo", "todo"]);
  assert.deepEqual(links, ["soft", "soft", "soft", "lit", "todo", "todo", "todo"]);
  const pts = constellationPoints("fire", 8);
  assert.equal(pts.length, 8);
  assert.deepEqual(pts[0], [32, 92]);
  assert.deepEqual(pts[7], [68, 92]);
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
