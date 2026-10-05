/**
 * พัซเซิลสวนดอกไม้ (ชีววิทยา: ความต้องการของพืช)
 * วิธีเล่น: มี 3 แปลง แต่ละแปลงมีพืชหนึ่งต้น แต่ละแปลงมี 3 ช่อง (แสง น้ำ ดิน)
 * เด็กลากการ์ดปัจจัยลงช่องให้ตรงกับที่พืชต้นนั้นต้องการ มีการ์ดหลอก 2 ใบที่ไม่ใช่ปัจจัยของพืช (เช่น เสียงเพลง) วางลงช่องใดไม่ได้
 *
 * ตัวตรวจ: ตรวจรายช่อง (การ์ดต้องเป็นปัจจัยเดียวกับช่อง และระดับตรงกับที่พืชต้องการ) การ์ดแต่ละใบใช้ได้ครั้งเดียว
 * การ์ดระดับเดียวกันสลับกันได้ ตัวตรวจไม่ผูกกับรหัสการ์ดตามเฉลย จึงไม่ตัดสินผิดเพราะสลับการ์ดที่เหมือนกัน
 */
import { type HintTier, type PuzzleModule, type ValidateResult, makeRng, fnv1a, PUZZLE_VERSION } from './core.ts';
import { FLOWER_CONTENT, type FactorDef, type PlantDef } from './content.ts';

export interface FlowerParams { plots: number; distractors: number }
export const FLOWER_DEFAULTS: FlowerParams = { plots: 3, distractors: 2 };

export interface FlowerCard {
  id: string;
  /** null = การ์ดหลอก */
  factorId: string | null;
  level: string | null;
  label: string;
}

export interface FlowerPuzzle {
  kind: 'flower';
  version: number;
  seed: number;
  params: FlowerParams;
  plots: { index: number; plantId: string; plantLabel: string }[];
  factors: { id: string; label: string }[];
  cards: FlowerCard[];
  /** เฉลย (เซิร์ฟเวอร์เท่านั้น): `${plot}:${factorId}` -> แท็กระดับที่ถูก */
  needs: Record<string, string>;
}

export interface FlowerPublic {
  kind: 'flower';
  version: number;
  plots: { index: number; plantId: string; plantLabel: string }[];
  factors: { id: string; label: string }[];
  /** ส่งระดับของการ์ดไม่ได้ (เป็นเฉลยบางส่วน) ส่งแค่ป้ายและปัจจัย */
  cards: { id: string; factorId: string | null; label: string }[];
}

export interface FlowerAnswer { slots: { plot: number; factorId: string; cardId: string }[] }
export interface FlowerHint {
  tier: HintTier;
  key: 'flower.general' | 'flower.where' | 'flower.show';
  slot?: { plot: number; factorId: string } | null;
  /** ขั้น 3: ระดับที่ถูกของช่องนั้น เป็นป้ายอ่านได้ ไม่ใช่รหัสการ์ด */
  levelLabel?: string;
}

function checkContent(factors: FactorDef[], plants: PlantDef[], p: FlowerParams, distractorCount: number): void {
  if (plants.length < p.plots) throw new Error('flower: not enough plants');
  if (distractorCount < p.distractors) throw new Error('flower: not enough distractor cards');
  const profiles = new Set<string>();
  for (const plant of plants) {
    for (const f of factors) {
      const lv = plant.needs[f.id];
      if (lv === undefined || !f.levels.includes(lv)) throw new Error(`flower: plant ${plant.id} has invalid need for ${f.id}`);
    }
    const key = factors.map((f) => plant.needs[f.id]).join('|');
    if (profiles.has(key)) throw new Error(`flower: duplicate need profile for ${plant.id}`);
    profiles.add(key);
  }
}

export function createFlowerPuzzle(
  overrides: Partial<FlowerParams> = {},
  content = FLOWER_CONTENT,
): PuzzleModule<FlowerPuzzle, FlowerPublic, FlowerAnswer, FlowerHint> {
  const params: FlowerParams = { ...FLOWER_DEFAULTS, ...overrides };
  checkContent(content.factors, content.plants, params, content.distractors.length);
  const labelOf = (f: FactorDef, level: string): string => f.levelLabels[f.levels.indexOf(level)] as string;

  const generate = (seed: number): FlowerPuzzle => {
    const rng = makeRng(seed);
    const chosen = rng.shuffle(content.plants).slice(0, params.plots);
    const plots = chosen.map((pl, i) => ({ index: i, plantId: pl.id, plantLabel: pl.label }));
    const needs: Record<string, string> = {};
    const raw: Omit<FlowerCard, 'id'>[] = [];
    chosen.forEach((pl, i) => {
      for (const f of content.factors) {
        const level = pl.needs[f.id] as string;
        needs[`${i}:${f.id}`] = level;
        raw.push({ factorId: f.id, level, label: labelOf(f, level) });
      }
    });
    for (const d of rng.shuffle(content.distractors).slice(0, params.distractors)) {
      raw.push({ factorId: null, level: null, label: d.label });
    }
    const cards: FlowerCard[] = rng.shuffle(raw).map((c, i) => ({ ...c, id: `k${i + 1}` }));
    return {
      kind: 'flower', version: PUZZLE_VERSION, seed, params, plots,
      factors: content.factors.map((f) => ({ id: f.id, label: f.label })), cards, needs,
    };
  };

  const publicView = (p: FlowerPuzzle): FlowerPublic => ({
    kind: 'flower', version: p.version,
    plots: p.plots.map((x) => ({ ...x })), factors: p.factors.map((x) => ({ ...x })),
    cards: p.cards.map((c) => ({ id: c.id, factorId: c.factorId, label: c.label })),
  });

  const slotKeys = (p: FlowerPuzzle): { plot: number; factorId: string }[] =>
    p.plots.flatMap((pl) => p.factors.map((f) => ({ plot: pl.index, factorId: f.id })));

  /** คืนรายการช่องที่ผิดหรือยังว่าง เรียงตามลำดับแปลง/ปัจจัย */
  const wrongSlots = (p: FlowerPuzzle, ans: FlowerAnswer | null): { plot: number; factorId: string; reason: string }[] => {
    const byCard = new Map(p.cards.map((c) => [c.id, c]));
    const placed = new Map<string, string>();
    const usedCards = new Set<string>();
    const out: { plot: number; factorId: string; reason: string }[] = [];
    const bad = new Set<string>();
    if (ans && Array.isArray(ans.slots)) {
      for (const s of ans.slots) {
        const key = `${s.plot}:${s.factorId}`;
        if (!(key in p.needs)) continue; // ช่องที่ไม่มีอยู่จริง ไม่นับ
        if (placed.has(key)) { bad.add(key); continue; } // ซ้ำช่อง
        const card = byCard.get(s.cardId);
        if (!card || usedCards.has(s.cardId)) { bad.add(key); placed.set(key, ''); continue; }
        usedCards.add(s.cardId);
        placed.set(key, s.cardId);
      }
    }
    for (const s of slotKeys(p)) {
      const key = `${s.plot}:${s.factorId}`;
      const cardId = placed.get(key);
      if (cardId === undefined) { out.push({ ...s, reason: 'empty' }); continue; }
      const card = byCard.get(cardId);
      if (bad.has(key) || !card) { out.push({ ...s, reason: 'invalid-card' }); continue; }
      if (card.factorId !== s.factorId) { out.push({ ...s, reason: 'wrong-factor' }); continue; }
      if (card.level !== p.needs[key]) out.push({ ...s, reason: 'wrong-level' });
    }
    return out;
  };

  const validate = (p: FlowerPuzzle, ans: FlowerAnswer): ValidateResult => {
    if (!ans || !Array.isArray(ans.slots)) return { ok: false, wrong: [], reason: 'malformed' };
    const w = wrongSlots(p, ans);
    return { ok: w.length === 0, wrong: w.map((x) => `plot:${x.plot}:${x.factorId}`), reason: w[0]?.reason };
  };

  const hint = (p: FlowerPuzzle, ans: FlowerAnswer | null, tier: HintTier): FlowerHint => {
    if (tier === 1) return { tier, key: 'flower.general' };
    const first = wrongSlots(p, ans)[0] ?? null;
    if (tier === 2) return { tier, key: 'flower.where', slot: first ? { plot: first.plot, factorId: first.factorId } : null };
    if (!first) return { tier, key: 'flower.show', slot: null };
    const f = content.factors.find((x) => x.id === first.factorId) as FactorDef;
    return { tier, key: 'flower.show', slot: { plot: first.plot, factorId: first.factorId }, levelLabel: labelOf(f, p.needs[`${first.plot}:${first.factorId}`] as string) };
  };

  const fingerprint = (p: FlowerPuzzle): string => fnv1a(JSON.stringify(p.plots.map((x) => x.plantId)));

  return { kind: 'flower', generate, publicView, validate, hint, fingerprint };
}

export const flower = createFlowerPuzzle();
