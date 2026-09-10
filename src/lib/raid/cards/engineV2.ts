// Ruleset 2 is immutable for saved runs. Change the version when changing combat rules.
// Pure engine: production supplies server entropy; preview/tests supply their own RNG.
export type Stat = "hp" | "atk" | "def" | "spd" | "foc";
export type Stats = Record<Stat, number>;
export type BossId = "ridge_mist" | "ridge_gale" | "ridge_storm";
export type CardId = "strike" | "guard" | "counter" | "dodge" | "interrupt" | "pierce" | "mend" | "focus" | "burst";
export type IntentId = "claw" | "pounce" | "veil" | "brace" | "charge" | "thunder" | "recover";
export type Rng = () => number;
export type Card = { id: CardId; name: string; stat: Stat | null; cost: number; kind: "attack" | "defend" | "support"; description: string; success: string };

export const CARDS: Record<CardId, Card> = {
  strike: { id: "strike", name: "โจมตี", stat: "atk", cost: 0, kind: "attack", description: "โจมตีพื้นฐาน ทำดาเมจแน่นอน", success: "ทำดาเมจตาม ATK" },
  guard: { id: "guard", name: "ตั้งหลัก", stat: "def", cost: 0, kind: "defend", description: "ลดดาเมจ 45% และฟื้นพลัง 1", success: "ลดดาเมจแน่นอน" },
  counter: { id: "counter", name: "ตั้งรับสวนกลับ", stat: "def", cost: 1, kind: "defend", description: "ลดดาเมจ 35% เสมอ • ผ่านเช็กแล้วสวนเมื่อถูกโจมตี", success: "ลดดาเมจ 70% และสวนกลับ" },
  dodge: { id: "dodge", name: "ก้าวพริบตา", stat: "spd", cost: 1, kind: "defend", description: "หลบแล้วเปิดจุดอ่อนรอบหน้า • พลาดยังลดดาเมจ 15%", success: "หลบทั้งหมด ยกเว้นสายฟ้าวงกว้างลดได้ 70%" },
  interrupt: { id: "interrupt", name: "ทลายจังหวะ", stat: "atk", cost: 2, kind: "attack", description: "โจมตี 80% • ผ่านเช็กแล้วหยุดกระโจนหรือชาร์จ", success: "หยุดท่าที่ขัดได้และเปิดจุดอ่อน" },
  pierce: { id: "pierce", name: "แทงจุดอ่อน", stat: "foc", cost: 1, kind: "attack", description: "โจมตี 80% • ผ่านเช็กแล้วทะลุเกราะและหมอก", success: "โจมตี 130% ไม่ติดเกราะ" },
  mend: { id: "mend", name: "ลมหายใจฟื้นฟู", stat: "hp", cost: 2, kind: "support", description: "ฟื้นเลือดตาม HP • ใช้แล้วบอสยังออกท่าได้", success: "ฟื้นเลือดเพิ่ม 50%" },
  focus: { id: "focus", name: "รวบรวมสมาธิ", stat: "foc", cost: 0, kind: "support", description: "ฟื้นพลัง 2 • เก็บแรงส่งให้การโจมตีครั้งหน้า", success: "แรงส่งเพิ่มดาเมจ 50% (พื้นฐาน 25%)" },
  burst: { id: "burst", name: "พลังพิชิต", stat: "atk", cost: 3, kind: "attack", description: "โจมตี 150% • เหมาะกับช่วงบอสเปิดจุดอ่อน", success: "โจมตี 220%" },
};
export const SPECIAL_CARDS: CardId[] = ["counter", "dodge", "interrupt", "pierce", "mend", "focus", "burst"];
export const MAX_TURNS = 20;
export const MAX_ENERGY = 5;
export const STAT_REQUIREMENTS: Record<BossId, number> = { ridge_mist:45, ridge_gale:60, ridge_storm:75 };
export const statPercent = (stats: Stats) => Object.values(stats).reduce((sum,value)=>sum+value,0) / 5;
export const BOSSES: Record<BossId, { name: string; level: string; subtitle: string; hp: number; attack: number; defense: number; dc: number; accent: string }> = {
  ridge_mist: { name: "จิ้งจอกหิมะเฒ่า", level: "เชิงหมอกจาง", subtitle: "อ่านหมอกให้ขาด แล้วเลือกจังหวะของเธอ", hp: 200, attack: 16, defense: 6, dc: 45, accent: "#99d5ff" },
  ridge_gale: { name: "เสือหิมะจอมผา", level: "สันลมโหม", subtitle: "รับแรงกระแทก แล้วเปลี่ยนเป็นพลังสวน", hp: 270, attack: 22, defense: 10, dc: 60, accent: "#a5edcf" },
  ridge_storm: { name: "พญาหมาป่าสายฟ้า", level: "ยอดฟ้าคำราม", subtitle: "เก็บพลังให้พร้อม ก่อนฟ้าจะคำราม", hp: 430, attack: 34, defense: 14, dc: 75, accent: "#d5b4ff" },
};
export const INTENTS: Record<IntentId, { name: string; hint: string; damage: number; interruptible: boolean }> = {
  claw: { name: "ตวัดกรงเล็บ", hint: "กำลังโจมตีตรง ๆ • ตั้งรับ สวนกลับ หรือแลกดาเมจ", damage: 1, interruptible: false },
  pounce: { name: "ย่อตัวกระโจน", hint: "ท่าหนักที่ขัดได้ • หลังลงพื้นจะเปิดจุดอ่อน", damage: 1.7, interruptible: true },
  veil: { name: "ม่านหมอกลวงตา", hint: "ซ่อนตัวหลังหมอก • แทงจุดอ่อน หรือเก็บพลังรอ", damage: 0.7, interruptible: false },
  brace: { name: "เกราะเหมันต์", hint: "ตั้งเกราะหนา • ทะลุเกราะ หรือใช้จังหวะนี้ฟื้นตัว", damage: 0, interruptible: false },
  charge: { name: "ชาร์จสายฟ้า", hint: "รอบนี้ไม่โจมตี • ขัดจังหวะได้ ก่อนสายฟ้ารอบหน้า", damage: 0, interruptible: true },
  thunder: { name: "สายฟ้าคำราม", hint: "โจมตีวงกว้าง • หลบไม่พ้นทั้งหมด และขัดจังหวะไม่ได้", damage: 2, interruptible: false },
  recover: { name: "เสียหลัก • จุดอ่อนเปิด", hint: "ไม่โจมตี • การโจมตีของเราแรงขึ้น 50%", damage: 0, interruptible: false },
};
export type TurnLog = {
  turn: number; card: CardId; intent: IntentId; success: boolean; chance: number; roll: number | null;
  stat: Stat | null; dc: number; dealt: number; taken: number; healed: number; interrupted: boolean;
  note: string; answerCorrect?: boolean;
};
export type Battle = {
  version: 2; bossId: BossId; stats: Stats; turn: number; hp: number; hpMax: number; bossHp: number;
  energy: number; hand: CardId[]; discard: CardId[]; intent: IntentId; previousIntent: IntentId | null;
  momentum: number; exposed: boolean; outcome: "win" | "defeat" | null; log: TurnLog[];
  defeatReason?: "stats" | "learning" | "hp" | "timeout";
};
export function isBossId(value: string): value is BossId { return Object.hasOwn(BOSSES, value); }
export function isCardId(value: string): value is CardId { return Object.hasOwn(CARDS, value); }
function pick<T>(items: readonly T[], rng: Rng): T {
  if (!items.length) throw new Error("Empty draw pool");
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(rng() * items.length)))];
}
export function createBattle(bossId: BossId, stats: Stats, rng: Rng): Battle {
  if (!isBossId(bossId)) throw new Error("Unknown boss");
  for (const key of ["hp", "atk", "def", "spd", "foc"] as Stat[]) {
    if (!Number.isFinite(stats[key]) || stats[key] < 0 || stats[key] > 500) throw new Error("Invalid stat");
  }
  // Fixed boss power; player HP translates the existing stat into a readable battle pool.
  const hpMax = 80 + Math.round(stats.hp * 1.5);
  const hand: CardId[] = [pick(["counter", "dodge"] as CardId[], rng), pick(["pierce", "interrupt", "burst"] as CardId[], rng), pick(["focus", "mend"] as CardId[], rng)];
  return {
    version: 2, bossId, stats: { ...stats }, turn: 1, hp: hpMax, hpMax, bossHp: BOSSES[bossId].hp,
    energy: 3, hand, discard: [], intent: bossId === "ridge_storm" ? "charge" : "claw",
    previousIntent: null, momentum: 0, exposed: false, outcome: null, log: [],
  };
}
export function phaseNumber(b: Battle): number {
  const ratio = b.bossHp / BOSSES[b.bossId].hp;
  return ratio <= 0.35 ? 3 : ratio <= 0.7 ? 2 : 1;
}
export function checkPreview(b: Battle, cardId: CardId) {
  const card = CARDS[cardId];
  const dc = BOSSES[b.bossId].dc + (phaseNumber(b) - 1) * 4 + (b.intent === "thunder" ? 8 : 0);
  const value = card.stat ? b.stats[card.stat] : 0;
  const certain = cardId === "strike" || cardId === "guard";
  // Far below threshold: only base effect. Within 25 points: a bounded D&D-style check.
  const chance = certain || value >= dc ? 100 : value < dc - 25 ? 0 : Math.round(25 + ((value - (dc - 25)) / 25) * 70);
  return { stat: card.stat, value, dc, chance, affordable: b.energy >= card.cost };
}
export function incomingDamage(b: Battle): number {
  const rage = Math.max(0, b.turn - 12) * 0.08;
  return Math.max(0, Math.round(BOSSES[b.bossId].attack * INTENTS[b.intent].damage *
    (1 + (phaseNumber(b) - 1) * 0.15 + rage) * (1 - Math.min(0.6, b.stats.def / 250))));
}
function nextIntent(b: Battle, previous: IntentId, interrupted: boolean, rng: Rng): IntentId {
  if (interrupted || previous === "pounce" || previous === "thunder") return "recover";
  if (previous === "charge") return "thunder";
  const phase = phaseNumber(b);
  const choices: IntentId[] = b.bossId === "ridge_mist"
    ? (phase === 1 ? ["claw", "veil", "brace"] : ["claw", "veil", "pounce"])
    : b.bossId === "ridge_gale" ? ["claw", "pounce", "brace", ...(phase > 1 ? ["pounce" as IntentId] : [])]
    : ["claw", "charge", "brace", ...(phase > 1 ? ["charge" as IntentId] : [])];
  return pick(choices.filter((id) => id !== previous && !(id === "brace" && previous === "recover")), rng);
}
export function resolveTurn(current: Battle, cardId: CardId, rng: Rng, answerCorrect = true): Battle {
  if (current.version !== 2 || current.outcome) throw new Error("รอบนี้จบแล้ว");
  if (!isCardId(cardId) || (!["strike", "guard"].includes(cardId) && !current.hand.includes(cardId))) throw new Error("ไม่มีการ์ดนี้ในมือ");
  const card = CARDS[cardId];
  if (card.cost > current.energy) throw new Error("พลังไม่พอสำหรับการ์ดนี้");
  const b: Battle = structuredClone(current);
  const check = checkPreview(b, cardId);
  const roll = check.chance > 0 && check.chance < 100 ? Math.floor(rng() * 100) + 1 : null;
  const success = answerCorrect && (check.chance === 100 || (roll !== null && roll <= check.chance));
  const base = Math.round(10 + b.stats.atk * 0.45);
  let dealt = 0, healed = 0, mitigation = 0, interrupted = false;
  b.energy -= card.cost;
  switch (cardId) {
    case "strike": dealt = base; break;
    case "guard": mitigation = 0.45; b.energy += 1; break;
    case "counter": mitigation = success ? 0.7 : 0.35; break;
    case "dodge": mitigation = success ? (b.intent === "thunder" ? 0.7 : 1) : 0.15; break;
    case "interrupt": dealt = base * 0.8; interrupted = success && INTENTS[b.intent].interruptible; break;
    case "pierce": dealt = Math.round(10 + b.stats.foc * 0.45) * (success ? 1.3 : 0.8); break;
    case "mend": healed = Math.round((8 + b.stats.hp * 0.2) * (success ? 1.5 : 1)); break;
    case "focus": b.energy += 2; b.momentum = Math.max(b.momentum, success ? 0.5 : 0.25); break;
    case "burst": dealt = base * (success ? 2.2 : 1.5); break;
  }
  // A wrong answer still gives a small action, but cannot trigger any special effect.
  if (!answerCorrect) {
    dealt *= 0.4; healed = Math.round(healed * 0.5); mitigation *= 0.5;
    if (cardId === "focus") { b.energy -= 1; b.momentum = Math.min(b.momentum,0.1); }
    if (cardId === "guard") b.energy -= 1;
  }
  if (dealt > 0) {
    dealt *= 1 + b.momentum + (b.exposed || b.intent === "recover" ? 0.5 : 0);
    b.momentum = 0;
    if (!(cardId === "pierce" && success)) {
      dealt = Math.max(1, dealt - BOSSES[b.bossId].defense * (b.intent === "brace" ? 2.5 : 1));
      if (b.intent === "veil") dealt *= 0.5;
    }
  }
  dealt = Math.min(b.bossHp, Math.max(0, Math.round(dealt)));
  b.bossHp -= dealt;
  healed = Math.min(healed, b.hpMax - b.hp);
  b.hp += healed;
  // Boss uses the advertised pre-action phase and damage, even if this hit crosses a phase boundary.
  const rawIncoming = incomingDamage(current);
  const taken = b.bossHp <= 0 || interrupted ? 0 : Math.min(b.hp, Math.round(rawIncoming * (1 - mitigation)));
  b.hp -= taken;
  if (cardId === "counter" && success && rawIncoming > 0 && b.bossHp > 0 && b.hp > 0) {
    const retaliation = Math.min(b.bossHp, Math.round(10 + b.stats.def * 0.4));
    b.bossHp -= retaliation;
    dealt += retaliation;
  }
  b.exposed = (cardId === "dodge" && success) || interrupted;
  b.energy = Math.min(MAX_ENERGY, b.energy + 1);
  if (cardId !== "strike" && cardId !== "guard") {
    b.hand = b.hand.filter((id) => id !== cardId);
    b.discard.push(cardId);
    let pool = SPECIAL_CARDS.filter((id) => !b.hand.includes(id) && !b.discard.includes(id));
    if (!pool.length) {
      b.discard = [cardId]; // do not immediately redraw the just-used card
      pool = SPECIAL_CARDS.filter((id) => !b.hand.includes(id) && id !== cardId);
    }
    b.hand.push(pick(pool, rng));
  }
  b.outcome = b.bossHp <= 0 ? "win" : b.hp <= 0 || b.turn >= MAX_TURNS ? "defeat" : null;
  const correctCount = current.log.filter(entry=>entry.answerCorrect !== false).length + Number(answerCorrect);
  if (b.bossHp <= 0 && statPercent(b.stats) < STAT_REQUIREMENTS[b.bossId]) { b.outcome="defeat"; b.defeatReason="stats"; }
  else if (b.bossHp <= 0 && correctCount / (current.log.length+1) < 0.6) { b.outcome="defeat"; b.defeatReason="learning"; }
  else if (b.outcome === "defeat") b.defeatReason = b.hp <= 0 ? "hp" : "timeout";
  b.log.push({
    turn: b.turn, card: cardId, intent: current.intent, success, chance: check.chance, roll,
    stat: check.stat, dc: check.dc, dealt, taken, healed, interrupted, answerCorrect,
    note: !answerCorrect ? "ยังไม่ถูก • ใช้แรงประคองตัว ไม่มีผลพิเศษ" : interrupted ? "ขัดจังหวะสำเร็จ! บอสเสียหลัก"
      : cardId === "interrupt" && success ? "โจมตีแล้ว • ท่านี้ของบอสขัดจังหวะไม่ได้"
      : cardId === "counter" && success && rawIncoming === 0 ? "ตั้งรับแล้ว • บอสไม่โจมตีจึงไม่ได้สวนกลับ"
      : success ? card.success : "ใช้ผลพื้นฐาน • พลังยังไม่ถึงผลพิเศษ",
  });
  b.previousIntent = current.intent;
  if (!b.outcome) { b.turn += 1; b.intent = nextIntent(b, current.intent, interrupted, rng); }
  return b;
}
export function damageProgress(b: Battle): number {
  return Math.round((1 - b.bossHp / BOSSES[b.bossId].hp) * 100);
}
export function rewardScore(b: Battle): number {
  // Completion is a real win/defeat, never a leave button. q4 requires a convincing victory.
  if (!b.outcome) return 0;
  return b.outcome === "win" ? Math.min(100, 80 + Math.round(20 * b.hp / b.hpMax)) : Math.min(79, damageProgress(b));
}
export function growthAdvice(b: Battle): { stat: Stat | null; text: string } {
  if (b.defeatReason === "stats") return {stat:null,text:`stat รวม ${statPercent(b.stats).toFixed(1)}% ยังไม่ถึง ${STAT_REQUIREMENTS[b.bossId]}% • จัดชุดเพิ่มหรือเลือกมอนที่พร้อมกว่านี้`};
  if (b.defeatReason === "learning") return {stat:null,text:"ตอบถูกยังไม่ถึง 60% • ทบทวนข้อที่พลาด แล้วกลับมาลองแผนนี้อีกครั้ง"};
  const failed = b.log.filter((entry) => !entry.success && entry.stat);
  const counts = new Map<Stat, number>();
  failed.forEach((entry) => counts.set(entry.stat!, (counts.get(entry.stat!) ?? 0) + 1));
  const weak = [...counts].sort((a, c) => c[1] - a[1])[0]?.[0];
  if (weak === "foc") return { stat: weak, text: "FOC ยังไม่ถึง • ลองเลือกมอนที่มี FOC สูงขึ้น หรือใช้ท่าที่อิงค่าสถานะถนัดของตัวนี้" };
  if (weak) return { stat: weak, text: `ลองจัดอุปกรณ์เพิ่ม ${weak.toUpperCase()} • ผลพิเศษของท่านี้ยังไม่สำเร็จ ${counts.get(weak)} ครั้ง` };
  if (b.outcome === "win") return { stat: null, text: "แผนนี้ใช้ได้ผล! ลองจัดชุดใหม่หรือไปท้าทายด่านถัดไป" };
  if (b.turn >= MAX_TURNS && b.hp > 0) return { stat: "atk", text: "ยืนระยะได้แล้ว • ลองเพิ่ม ATK หรือเก็บท่าแรงไว้ตอนจุดอ่อนเปิด" };
  return { stat: "def", text: "ลองเพิ่ม DEF / HP หรือเก็บการ์ดตั้งรับไว้รับท่าหนัก" };
}
