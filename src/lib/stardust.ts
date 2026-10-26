import { BASE_EXP_PER_CORRECT } from "./exp.ts";
import { STAGE_EXP_THRESHOLD, getEvolutionProgress } from "./evolution.ts";
import { eggAnswersLeft } from "./homeTrail.ts";

// หน้า /quiz "ตามหาประกายดาว" (flag QUIZ_STARDUST_ENABLED) — ส่วนที่คำนวณได้โดยไม่แตะ DOM/DB อยู่ที่นี่ทั้งหมด
// ข้อความทุกคำของหน้าอยู่ใน STARDUST_TEXT จุดเดียว · ต้นแบบ .oil-ui/quiz-play/ (design.md + proto/)
// "ประกายดาว" = ชื่อในโลกของ EXP ไม่ใช่สกุลเงินใหม่ — ตัวเลขยังเขียน EXP เสมอ

export type StarState = "lit" | "soft" | "now" | "todo";
export type LinkState = "lit" | "soft" | "todo";

// ธาตุไข่ — egg_types ไม่มี column ธาตุ จึง map จาก sprite_prefix (ชื่อไข่/ชื่อสายพันธุ์ใน evolution.ts ยืนยันธาตุ)
// neutral = ไม่รู้ธาตุ → ทองกลาง
export type StardustElement = "fire" | "wood" | "water" | "sky" | "earth" | "divine" | "neutral";

const ELEMENT_BY_PREFIX: Record<string, StardustElement> = {
  egg1: "fire", // ไข่แก่นเพลิง
  egg2: "wood", // ไข่แก่นพฤกษ์
  egg3: "divine", // ไข่เทพทิพย์
  egg4: "water", // ไข่ฤทธิ์ธาร
  egg5: "sky", // ไข่ศักดิ์นภา
  egg6: "earth", // ไข่ศักดิ์ธรา
};

// ?element= ของพรีวิว → sprite_prefix (ใช้รูปไข่/น้องของธาตุนั้น) · ค่าอื่น = พฤกษ์
export function previewSpritePrefix(element: unknown): string {
  const hit = Object.entries(ELEMENT_BY_PREFIX).find(([, el]) => el === element);
  return hit ? hit[0] : "egg2";
}

export function elementFromSpritePrefix(prefix: string | null | undefined): StardustElement {
  return (prefix && ELEMENT_BY_PREFIX[prefix]) || "neutral";
}

// ---------- แถบดาว ----------

// results = ผลของข้อในรอบนี้เรียงตามลำดับ (undefined = ยังไม่ตอบ) · total = ดาวทั้งแถบ
// priorCount = ข้อที่ทำไปแล้วก่อนรอบนี้ (ภารกิจที่ทำต่อ) — ไม่รู้ผลถูก/ผิด → ดาวติดแต่ไม่มีเส้น
// currentIndex = ตำแหน่งดาวของข้อปัจจุบันบนแถบ (นับรวม priorCount แล้ว)
export function buildStarStates(
  results: readonly (boolean | undefined)[],
  total: number,
  currentIndex: number,
  priorCount = 0
): { stars: StarState[]; links: LinkState[] } {
  const n = Math.max(1, total);
  const resultAt = (i: number): boolean | undefined | "prior" => (i < priorCount ? "prior" : results[i - priorCount]);
  const stars: StarState[] = [];
  for (let i = 0; i < n; i++) {
    const r = resultAt(i);
    if (r === "prior" || r === true) stars.push("lit");
    else if (r === false) stars.push("soft");
    else stars.push(i === currentIndex ? "now" : "todo");
  }
  const links: LinkState[] = [];
  for (let i = 1; i < n; i++) {
    const a = resultAt(i - 1);
    const b = resultAt(i);
    if (a === true && b === true) links.push("lit");
    else if (b === undefined) links.push("todo");
    else links.push("soft");
  }
  return { stars, links };
}

export function countLit(results: readonly (boolean | undefined)[]): number {
  return results.filter((r) => r === true).length;
}

// ---------- ช่วงไข่ ----------

// เกณฑ์ฟักจริง = EXP ระยะ 1 (STAGE_EXP_THRESHOLD[1] = 50) ÷ EXP ต่อข้อ (10) = ตอบถูก 5 ข้อ — ไม่ใช่ counter แยก
// รอยร้าวก่อนรอบ = 5 − ข้อที่ยังต้องตอบ (eggAnswersLeft ตัวเดียวกับหน้าแรก)
export const EGG_HATCH_ANSWERS = Math.ceil(STAGE_EXP_THRESHOLD[1] / BASE_EXP_PER_CORRECT);

export function eggCracksBefore(exp: number): number {
  return Math.max(0, EGG_HATCH_ANSWERS - eggAnswersLeft(exp));
}

export function eggCracks(cracksBefore: number, correctInRound: number): number {
  return Math.min(EGG_HATCH_ANSWERS, Math.max(0, cracksBefore + correctInRound));
}

// ---------- กล่องการเติบโต ----------

// was/now = สัดส่วน 0–1 ภายในระยะ · left = EXP ที่ยังขาดถึงเปลี่ยนร่าง (null = ระยะสูงสุด ไม่มีเกณฑ์ต่อ)
export function stageGrowth(stage: number, expBefore: number, added: number) {
  const expAfter = expBefore + Math.max(0, added);
  const threshold = STAGE_EXP_THRESHOLD[stage];
  return {
    was: getEvolutionProgress(stage, expBefore),
    now: getEvolutionProgress(stage, expAfter),
    left: threshold === undefined ? null : Math.max(0, threshold - expAfter),
  };
}

// ---------- คำพูดน้อง ----------

export function starComboLine(combo: number): string | null {
  if (combo === 3) return STARDUST_TEXT.say.combo3;
  if (combo === 5) return STARDUST_TEXT.say.combo5;
  if (combo === 8) return STARDUST_TEXT.say.combo8;
  return null;
}

// combo = คอมโบหลังตอบข้อนี้ (นับข้ามรอบตามระบบเดิม) — แตะพอดี 3/5/8 เหมือนคิว event เดิม
export function pickQmonLine(input: {
  isEgg: boolean;
  correct: boolean;
  combo: number;
  cracksLeft: number;
  index?: number;
}): string {
  const { say } = STARDUST_TEXT;
  if (input.isEgg) return input.correct ? say.eggOk(input.cracksLeft) : say.eggMiss;
  if (!input.correct) return say.miss;
  return starComboLine(input.combo) ?? say.ok[(input.index ?? 0) % say.ok.length];
}

// ---------- กลุ่มดาวตอนจบรอบ (พิกัด 0–100) ----------

// พฤกษ์/เพลิงตามต้นแบบ · อีก 4 ธาตุเป็นร่าง รอปอนด์ดู
export const CONSTELLATIONS: Record<StardustElement, [number, number][]> = {
  fire: [[32, 92], [22, 58], [50, 6], [78, 52], [68, 92]], // เปลวไฟ
  wood: [[50, 96], [40, 66], [14, 40], [58, 30], [86, 6]], // กิ่งงอก
  water: [[8, 40], [30, 64], [52, 40], [74, 64], [94, 40]], // ร่าง: คลื่น
  sky: [[10, 70], [32, 30], [52, 58], [74, 16], [92, 46]], // ร่าง: สายฟ้า/ปีก
  earth: [[8, 92], [30, 44], [50, 70], [70, 30], [92, 92]], // ร่าง: ภูเขา
  divine: [[50, 4], [62, 40], [96, 46], [64, 64], [36, 64]], // ร่าง: ดาวประกาย
  neutral: [[8, 70], [30, 40], [50, 60], [70, 30], [92, 50]],
};

// จำนวนดาวไม่ใช่ 5 (ภารกิจ target อื่น) — กระจายจุดเท่าๆ กันตามเส้นของรูป 5 จุด
export function constellationPoints(element: StardustElement, count: number): [number, number][] {
  const shape = CONSTELLATIONS[element] ?? CONSTELLATIONS.neutral;
  const n = Math.max(1, Math.round(count));
  if (n === shape.length) return shape.map(([x, y]) => [x, y]);
  if (n === 1) return [shape[Math.floor(shape.length / 2)]];
  const segLen = shape.slice(1).map((p, i) => Math.hypot(p[0] - shape[i][0], p[1] - shape[i][1]));
  const totalLen = segLen.reduce((a, b) => a + b, 0);
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    let d = (totalLen * k) / (n - 1);
    let s = 0;
    while (s < segLen.length - 1 && d > segLen[s]) d -= segLen[s++];
    const t = segLen[s] === 0 ? 0 : Math.min(1, d / segLen[s]);
    const [x1, y1] = shape[s];
    const [x2, y2] = shape[s + 1];
    out.push([Math.round((x1 + (x2 - x1) * t) * 10) / 10, Math.round((y1 + (y2 - y1) * t) * 10) / 10]);
  }
  return out;
}

// ตัวช่วยพรีวิว ?stardustPreview= (ไม่ใช่ production เท่านั้น — quiz/page.tsx กันไว้)
export const STARDUST_PREVIEWS = ["egg-intro", "egg", "image", "correct", "wrong", "end", "egg-end"] as const;
export type StardustPreviewKind = (typeof STARDUST_PREVIEWS)[number];

export function parseStardustPreview(value: unknown): StardustPreviewKind | null {
  return typeof value === "string" && (STARDUST_PREVIEWS as readonly string[]).includes(value)
    ? (value as StardustPreviewKind)
    : null;
}

export const CHOICE_LETTERS = ["ก", "ข", "ค", "ง"];

// ---------- ข้อความทั้งหน้า ----------

export const STARDUST_TEXT = {
  say: {
    ok: ["เห็นรูปแบบแล้ว! เก็บประกายดาวได้อีกดวง", "ดาวดวงนี้สว่างมาก ไปต่อกันเลย", "เราเข้าใจตรงนี้แล้ว ดาวติดอีกดวง"],
    combo3: "ดาวต่อกันสามดวงแล้ว เริ่มเห็นรูปร่างของเราแล้วนะ",
    combo5: "ต่อกันครบทุกดวงเลย! รูปของเราชัดมาก",
    combo8: "ดาวต่อกันแปดดวงแล้ว! เราสว่างขึ้นเรื่อยๆ เลย",
    miss: "วิธีนี้ยังไม่ลงตัว ลองดูตรงนี้อีกทีนะ",
    eggOk: (left: number) => (left > 0 ? `ไข่ร้าวอีกนิดแล้ว อีก ${left} ข้อเราจะตื่น` : "ไข่ร้าวครบแล้ว! จบรอบนี้เราจะตื่นมาเจอกัน"),
    eggMiss: "ข้างในไข่ยังฟังอยู่นะ อ่านคำอธิบายไปด้วยกัน",
  },
  meta: (isMission: boolean, n: number, total: number) => `${isMission ? "ภารกิจวันนี้" : "ฝึกฝน"} · ข้อ ${n} จาก ${total}`,
  stripLabel: (lit: number, n: number, total: number) => `เก็บประกายดาวแล้ว ${lit} ดวง · ข้อ ${n} จาก ${total}`,
  stripLabelEgg: (cracks: number, n: number, total: number) =>
    `ไข่ร้าวแล้ว ${cracks} จาก ${EGG_HATCH_ANSWERS} ช่อง · ข้อ ${n} จาก ${total}`,
  exit: "ออกจากรอบทำโจทย์",
  correct: "ถูกแล้ว",
  wrong: "ยังไม่ใช่",
  answerIs: (letter: string, text: string) => `คำตอบคือ ${letter}. ${text}`,
  next: "ไปต่อ",
  lastNext: "ดูดาวของรอบนี้",
  saving: "กำลังบันทึกดาวของรอบนี้…",
  choiceOk: "คำตอบที่ถูก",
  choiceMiss: "ที่เลือก ยังไม่ใช่",
  image: {
    zoom: "ขยาย",
    zoomLabel: "ขยายรูปโจทย์",
    close: "ปิดรูป",
    dialog: "รูปโจทย์ขนาดเต็ม",
    alt: "รูปประกอบโจทย์",
    loading: "กำลังโหลดรูปโจทย์…",
    failed: "รูปโจทย์โหลดไม่สำเร็จ ลองโหลดรูปก่อนตอบนะ",
    retry: "โหลดรูปอีกครั้ง",
  },
  intro: [
    { t: "ทุกความสงสัย ตกผลึกเป็นไข่ใบนี้", s: "ข้างในมี Qmon หลับรออยู่", b: "ต่อไป" },
    { t: "ตอบให้ถูก แล้วเราจะค่อยๆ ตื่น", s: `ตอบถูกครบ ${EGG_HATCH_ANSWERS} ข้อ ไข่จะฟัก`, b: "เริ่มเลย" },
  ],
  end: {
    head: (n: number) => `เก็บประกายดาวได้ ${n} ดวง`,
    lead: (n: number, total: number) => `ตอบถูก ${n} จาก ${total} ข้อ`,
    zeroHead: "รอบนี้เราลองครบทุกข้อแล้ว",
    zeroLead: "ดาวยังไม่ติด ลองอีกรอบด้วยกันนะ",
    hatchHead: "ไข่ร้าวครบแล้ว!",
    hatchLead: "เราพร้อมตื่นแล้ว ไปดูไข่ฟักกัน",
    eggLead: (n: number, total: number, left: number) => `ตอบถูก ${n} จาก ${total} ข้อ · อีก ${left} ข้อไข่จะฟัก`,
    grow: (name: string) => `${name} โตขึ้น`,
    stageLeft: (stage: number, left: number) => `ระยะ ${stage} · อีก ${left} EXP จะเปลี่ยนร่าง`,
    stageReady: (stage: number) => `ระยะ ${stage} · พร้อมเปลี่ยนร่างแล้ว`,
    stageMax: (stage: number) => `ระยะ ${stage} · โตเต็มที่แล้ว`,
    evolved: (stage: number) => `เปลี่ยนร่างเป็นระยะ ${stage} แล้ว`,
    cracks: "รอยร้าวบนไข่",
    eggGain: (exp: number) => `ได้ +${exp} EXP จากรอบนี้`,
    missionBonus: "โบนัสภารกิจ",
    farmCoins: "เหรียญฟาร์ม",
    toGarden: "ไปสร้างสวน",
    capped: (name: string, exp: number) => `วันนี้${name}ได้ EXP ครบแล้ว เข้าตัวไป ${exp} EXP พรุ่งนี้มาต่อกันนะ`,
    missionClaimFailed:
      "ยืนยันผลภารกิจล่าสุดไม่สำเร็จ (เน็ตอาจหลุด) ตัวเลขด้านบนอาจไม่ตรงเป๊ะ แต่ผลตอบที่บันทึกไปแล้วปลอดภัยดี",
    reviewTitle: (n: number) => `ทบทวนข้อที่พลาด ${n} ข้อ`,
    reviewSub: "สั้นๆ ไม่ให้ EXP ซ้ำ",
    reviewBtn: "ทบทวน",
    playAgain: "เล่นอีกรอบ",
    goHatch: "ไปดูไข่ฟัก",
    backTo: (name: string) => `กลับไปหา ${name}`,
  },
  // ยังไม่ตั้งชื่อ (ไข่) / ไม่มีชื่อ
  fallbackName: "น้อง",
  eggName: "ไข่",
} as const;
