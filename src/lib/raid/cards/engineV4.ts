import * as old from "./engineV3.ts";
import type { BossId, Stats, Rng, Card, CardId, IntentId } from "./engineV2.ts";

export type ChapterBattle = Omit<old.ShortBattle, "version" | "log"> & {
  version: 4;
  log: (old.TurnLog & { reflected?: number })[];
};
export type ChapterOffer = {
  id: string;
  chapter: string;
  subject: string;
  difficulty: number;
  cardId: CardId;
};
export const CHAPTER_CARDS: Partial<Record<CardId, Card>> = {
  strike: {
    id: "strike",
    name: "โจมตีหนัก",
    stat: "atk",
    cost: 0,
    kind: "attack",
    description: "ตอบถูก: โจมตี 120% • ไม่มีผลป้องกัน",
    success: "โจมตีเต็มแรง",
  },
  mend: {
    id: "mend",
    name: "ดูดเลือด",
    stat: "hp",
    cost: 0,
    kind: "support",
    description: "ตอบถูก: โจมตี 90% • ฟื้นเลือด 40–60% ของดาเมจจริง",
    success: "ดูดเลือดจากการโจมตี",
  },
  counter: {
    id: "counter",
    name: "ตั้งรับสวนกลับ",
    stat: "def",
    cost: 0,
    kind: "defend",
    description: "ตอบถูก: โจมตี 80% • ลดดาเมจรับ 55% และสวนเมื่อบอสโจมตี",
    success: "ตั้งรับพร้อมสวนกลับ",
  },
  pierce: {
    id: "pierce",
    name: "เจาะเกราะ",
    stat: "foc",
    cost: 0,
    kind: "attack",
    description: "ตอบถูก: โจมตี 100–115% ข้ามเกราะ • แรงขึ้นตาม FOC",
    success: "โจมตีทะลุเกราะ",
  },
  interrupt: {
    id: "interrupt",
    name: "ขัดจังหวะ",
    stat: "spd",
    cost: 0,
    kind: "defend",
    description: "ตอบถูก: โจมตี 85–100% • หยุดชาร์จหรือท่าหนัก",
    success: "ขัดจังหวะบอส",
  },
  focus: {
    id: "focus",
    name: "เปิดจุดอ่อน",
    stat: "foc",
    cost: 0,
    kind: "support",
    description: "ตอบถูก: โจมตี 60% • การโจมตีข้อหน้าแรงขึ้น 60–90%",
    success: "เปิดจุดอ่อนสำหรับข้อหน้า",
  },
};
export const CHAPTER_INTENTS: Partial<
  Record<IntentId, { name: string; hint: string }>
> = {
  claw: {
    name: "ตวัดกรงเล็บ",
    hint: "บอสจะโจมตี • ตั้งรับสวนกลับช่วยลดความเสียหาย",
  },
  brace: {
    name: "ตั้งเกราะ",
    hint: "ลดดาเมจ 40% และโจมตีเบา • เจาะเกราะข้ามการป้องกันได้",
  },
  charge: {
    name: "ชาร์จพลัง",
    hint: "ข้อนี้ไม่โจมตี • ขัดจังหวะได้ มิฉะนั้นข้อหน้าจะใช้ท่าหนัก",
  },
  thunder: {
    name: "ปล่อยพลัง",
    hint: "ท่าหนัก • ขัดจังหวะได้ หรือตั้งรับแล้วสวน",
  },
  recover: {
    name: "เสียหลัก",
    hint: "บอสไม่โจมตี • โอกาสเร่งดาเมจหรือดูดเลือด",
  },
};
export function createChapterBattle(
  bossId: BossId,
  stats: Stats,
  rng: Rng,
): ChapterBattle {
  return {
    ...old.createBattle(bossId, stats, rng),
    version: 4,
    hand: [],
    intent: bossId === "ridge_storm" ? "charge" : "claw",
  };
}
export function incomingDamage(b: ChapterBattle): number {
  const multiplier = {
    claw: 1,
    brace: 0.55,
    charge: 0,
    thunder: 2.1,
    recover: 0,
    veil: 1,
    pounce: 1.5,
  }[b.intent];
  return Math.round(
    old.BOSSES[b.bossId].attack *
      1.35 *
      multiplier *
      (1 - Math.min(0.5, b.stats.def / 250)),
  );
}
function nextIntent(
  b: ChapterBattle,
  interrupted: boolean,
  rng: Rng,
): IntentId {
  if (interrupted || b.intent === "thunder") return "recover";
  if (b.intent === "charge") return "thunder";
  const options: IntentId[] =
    b.bossId === "ridge_mist"
      ? ["claw", "brace", "claw", "charge"]
      : b.bossId === "ridge_gale"
        ? ["claw", "brace", "brace", "charge"]
        : ["claw", "charge", "charge", "brace"];
  const eligible = options.filter(
    (i) =>
      i !== b.intent &&
      !(i === "charge" && b.turn + 1 >= old.QUESTION_LIMITS[b.bossId]),
  );
  return (
    eligible[
      Math.min(eligible.length - 1, Math.floor(rng() * eligible.length))
    ] ?? "claw"
  );
}
export function resolveTurn(
  current: ChapterBattle,
  id: CardId,
  rng: Rng,
  correct = true,
): ChapterBattle {
  if (current.outcome) throw new Error("รอบนี้จบแล้ว");
  const card = CHAPTER_CARDS[id];
  if (!card) throw new Error("ไม่มีสกิลนี้ในรอบแบบบทเรียน");
  const b: ChapterBattle = structuredClone(current);
  const limit = old.QUESTION_LIMITS[b.bossId];
  const base =
    (old.BOSSES[b.bossId].hp / limit) *
    (1.05 + Math.min(0.45, b.stats.atk / 250));
  const factors: Partial<Record<CardId, number>> = {
    strike: 1.2,
    mend: 0.9,
    counter: 0.8,
    pierce: 1 + Math.min(0.15, b.stats.foc / 800),
    interrupt: 0.85 + Math.min(0.15, b.stats.spd / 800),
    focus: 0.6,
  };
  const interrupted =
    correct &&
    id === "interrupt" &&
    (b.intent === "charge" || b.intent === "thunder");
  const armor = b.intent === "brace" && !(correct && id === "pierce") ? 0.6 : 1;
  const dealt = Math.min(
    b.bossHp,
    Math.max(
      1,
      Math.round(
        base * (correct ? factors[id]! : 0.25) * armor * (1 + b.momentum),
      ),
    ),
  );
  b.bossHp -= dealt;
  const healed =
    correct && id === "mend"
      ? Math.min(
          b.hpMax - b.hp,
          Math.round(dealt * (0.4 + Math.min(0.2, b.stats.hp / 500))),
        )
      : 0;
  b.hp += healed;
  const incoming = b.bossHp > 0 && !interrupted ? incomingDamage(current) : 0;
  const taken = Math.min(
    b.hp,
    Math.round(incoming * (correct && id === "counter" ? 0.45 : 1)),
  );
  b.hp -= taken;
  const reflected =
    correct && id === "counter" && incoming > 0 && b.hp > 0
      ? Math.min(
          b.bossHp,
          Math.round(base * (0.4 + Math.min(0.2, b.stats.def / 500))),
        )
      : 0;
  b.bossHp -= reflected;
  b.momentum =
    correct && id === "focus" && b.turn < limit
      ? 0.6 + Math.min(0.3, b.stats.foc / 400)
      : 0;
  b.exposed = b.momentum > 0;
  b.outcome =
    b.bossHp <= 0 ? "win" : b.hp <= 0 || b.turn >= limit ? "defeat" : null;
  if (b.outcome === "defeat") b.defeatReason = b.hp <= 0 ? "hp" : "timeout";
  b.log.push({
    turn: b.turn,
    card: id,
    intent: b.intent,
    success: correct,
    chance: 100,
    roll: null,
    stat: card.stat,
    dc: 0,
    dealt: dealt + reflected,
    taken,
    healed,
    reflected,
    interrupted,
    answerCorrect: correct,
    critical: false,
    note: !correct
      ? "ยังไม่ถูก • โจมตีเบา 25% สกิลพิเศษไม่ทำงาน"
      : interrupted
        ? "หยุดท่าบอสสำเร็จ"
        : id === "interrupt"
          ? "โจมตีแล้ว • ท่านี้ขัดไม่ได้"
          : id === "counter"
            ? reflected > 0
              ? "ตั้งรับและสวนกลับ"
              : "ตั้งรับแล้ว • ไม่มีจังหวะสวน"
            : id === "focus"
              ? b.momentum > 0
                ? "เปิดจุดอ่อน • ข้อหน้าโจมตีแรงขึ้น"
                : "โจมตีแล้ว • ไม่มีข้อถัดไป"
              : card.success,
  });
  b.previousIntent = b.intent;
  if (!b.outcome) {
    b.intent = nextIntent(b, interrupted, rng);
    b.turn++;
  }
  return b;
}
