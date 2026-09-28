// Facade: saved rulesets 2/3 keep their original behavior.
import * as old from "./engineV3.ts";
import * as v4 from "./engineV4.ts";
import type { CardId } from "./engineV2.ts";
export * from "./engineV3.ts";
export {
  CHAPTER_CARDS,
  CHAPTER_INTENTS,
  createChapterBattle,
} from "./engineV4.ts";
export type { ChapterOffer, ChapterBattle } from "./engineV4.ts";
export type Battle = old.Battle | v4.ChapterBattle;
export type TurnLog = old.TurnLog & { reflected?: number };
const asOld = (b: Battle): old.Battle =>
  b.version === 4 ? { ...b, version: 3 } : b;
export const questionLimit = (b: Battle) => old.questionLimit(asOld(b));
export const cardInfo = (b: Battle, id: CardId) =>
  b.version === 4
    ? (v4.CHAPTER_CARDS[id] ?? old.CARDS[id])
    : old.cardInfo(b, id);
export const checkPreview = (b: Battle, id: CardId) =>
  b.version === 4
    ? {
        stat: cardInfo(b, id).stat,
        value: 0,
        dc: 0,
        chance: 100,
        affordable: true,
      }
    : old.checkPreview(b, id);
export const phaseNumber = (b: Battle) => old.phaseNumber(asOld(b));
export const damageProgress = (b: Battle) => old.damageProgress(asOld(b));
export const rewardScore = (b: Battle) => old.rewardScore(asOld(b));
export const incomingDamage = (b: Battle) =>
  b.version === 4 ? v4.incomingDamage(b) : old.incomingDamage(b);
export const resolveTurn = (
  b: Battle,
  id: CardId,
  rng: () => number,
  correct = true,
): Battle =>
  b.version === 4
    ? v4.resolveTurn(b, id, rng, correct)
    : old.resolveTurn(b, id, rng, correct);
export const growthAdvice = (b: Battle) =>
  b.version === 4
    ? {
        stat: null,
        text:
          b.outcome === "win"
            ? "เลือกบทและสกิลได้ดี! ลองท้าด่านถัดไป"
            : b.hp === 0
              ? "ลองดูดเลือด หรือตั้งรับสวนกลับตอนบอสใช้ท่าหนัก"
              : "เลือกบทที่มั่นใจ แล้วใช้เจาะเกราะหรือเปิดจุดอ่อนเพื่อเร่งดาเมจ",
      }
    : old.growthAdvice(b);
