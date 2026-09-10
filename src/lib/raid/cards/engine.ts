// New rounds use ruleset 3; saved ruleset 2 rounds retain their original behavior.
import * as legacy from "./engineV2.ts";
export type { Stat, Stats, BossId, CardId, IntentId, Rng, Card } from "./engineV2.ts";
import type { Stats, BossId, CardId, Rng, Card, Stat } from "./engineV2.ts";
export const { BOSSES, CARDS, INTENTS, MAX_ENERGY, MAX_TURNS, STAT_REQUIREMENTS, statPercent, isBossId, isCardId, SPECIAL_CARDS } = legacy;
export type TurnLog = legacy.TurnLog & { critical?: boolean };
export type ShortBattle = Omit<legacy.Battle, "version" | "log"> & { version: 3; log: TurnLog[] };
export type Battle = legacy.Battle | ShortBattle;
export const QUESTION_LIMITS: Record<BossId, number> = { ridge_mist: 5, ridge_gale: 6, ridge_storm: 8 };
export const QUICK_CARDS: Partial<Record<CardId, Card>> = {
  strike: { id: "strike", name: "ตีแรง", stat: "atk", cost: 0, kind: "attack", description: "โจมตีแรงขึ้นอีกนิด ลุ้นคริติคอล", success: "โจมตีเต็มพลัง" },
  mend: { id: "mend", name: "ตีพร้อมฟื้นเลือด", stat: "hp", cost: 0, kind: "support", description: "โจมตีบอสพร้อมเติมเลือดให้มอน", success: "โจมตีพร้อมฟื้นเลือด" },
};
const legacyView = (b: Battle): legacy.Battle => ({ ...b, version: 2 });
export const questionLimit = (b: Battle) => b.version === 3 ? QUESTION_LIMITS[b.bossId] : MAX_TURNS;
export const cardInfo = (b: Battle, id: CardId): Card => b.version === 3 ? QUICK_CARDS[id] ?? CARDS[id] : CARDS[id];
export function createBattle(bossId: BossId, stats: Stats, rng: Rng): ShortBattle {
  return { ...legacy.createBattle(bossId, stats, rng), version: 3, energy: 0, hand: ["strike", "mend"], discard: [] };
}
export const phaseNumber = (b: Battle) => legacy.phaseNumber(legacyView(b));
export const damageProgress = (b: Battle) => legacy.damageProgress(legacyView(b));
export const rewardScore = (b: Battle) => legacy.rewardScore(legacyView(b));
export function checkPreview(b: Battle, cardId: CardId) {
  if (b.version === 2) return legacy.checkPreview(b, cardId);
  const card = cardInfo(b, cardId);
  return { stat: card.stat, value: card.stat ? b.stats[card.stat] : 0, dc: 0,
    chance: Math.round(Math.min(45, 15 + b.stats.foc * 0.15 + b.stats.spd * 0.1)), affordable: true };
}
export function incomingDamage(b: Battle): number {
  if (b.version === 2) return legacy.incomingDamage(b);
  // Gentle fixed pressure: even a weak Qmon gets to answer all questions.
  return Math.max(1, Math.round(Math.min(BOSSES[b.bossId].attack * 0.55, b.hpMax / (QUESTION_LIMITS[b.bossId] + 2)) *
    (1 - Math.min(0.4, b.stats.def / 300))));
}
export function resolveTurn(current: Battle, cardId: CardId, rng: Rng, answerCorrect = true): Battle {
  if (current.version === 2) return legacy.resolveTurn(current, cardId, rng, answerCorrect);
  if (current.outcome) throw new Error("รอบนี้จบแล้ว");
  if (!current.hand.includes(cardId) || !QUICK_CARDS[cardId]) throw new Error("ไม่มีการ์ดนี้ในมือ");
  const b: ShortBattle = structuredClone(current);
  const limit = QUESTION_LIMITS[b.bossId];
  const card = cardInfo(b, cardId);
  const preview = checkPreview(b, cardId);
  const roll = answerCorrect ? Math.min(100, Math.max(1, Math.floor(rng() * 100) + 1)) : null;
  const critical = answerCorrect && roll !== null && roll <= preview.chance;
  const power = 1.1 + Math.min(0.45, b.stats.atk / 250);
  const base = BOSSES[b.bossId].hp / limit * power;
  const dealt = Math.min(b.bossHp, Math.max(1, Math.round(base * (cardId === "strike" ? 1.12 : 1) *
    (answerCorrect ? critical ? 1.5 : 1 : 0.25))));
  const healed = Math.min(b.hpMax - b.hp, cardId === "mend" ? Math.round((8 + b.stats.hp * 0.12) * (answerCorrect ? 1 : 0.5)) : 0);
  b.bossHp -= dealt;
  b.hp += healed;
  const taken = b.bossHp === 0 ? 0 : Math.min(b.hp, incomingDamage(current));
  b.hp -= taken;
  b.outcome = b.bossHp === 0 ? "win" : b.turn >= limit || b.hp === 0 ? "defeat" : null;
  if (b.outcome === "defeat") b.defeatReason = b.hp === 0 ? "hp" : "timeout";
  b.log.push({ turn: b.turn, card: cardId, intent: b.intent, success: answerCorrect, critical,
    chance: preview.chance, roll, stat: card.stat, dc: 0, dealt, taken, healed, interrupted: false, answerCorrect,
    note: !answerCorrect ? "ยังไม่ถูก ไม่เป็นไร! มอนช่วยโจมตีเบา ๆ" : critical ? "คริติคอล! มอนปล่อยพลังสุดแรง" : card.success });
  b.previousIntent = b.intent;
  if (!b.outcome) { b.turn += 1; b.intent = b.turn % 2 === 0 ? "pounce" : "claw"; }
  return b;
}
export function growthAdvice(b: Battle): { stat: Stat | null; text: string } {
  if (b.version === 2) return legacy.growthAdvice(b);
  return { stat: null, text: b.outcome === "win" ? "เก่งมาก! รับของแล้วค่อยกลับมาลุ้นกันใหม่" :
    "มอนสู้เต็มที่แล้ว! รับของรอบนี้ได้เลย ฝึกอีกนิดแล้วกลับมาลุ้นใหม่" };
}
