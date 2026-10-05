/**
 * พัซเซิลหอดูดาว (ดาราศาสตร์: ลำดับดาวเคราะห์จากดวงอาทิตย์)
 * วิธีเล่น: สุ่มดาวเคราะห์ 6 ดวงจาก 8 ดวง วางลงวงโคจร 6 ช่อง (ใกล้ -> ไกลดวงอาทิตย์) มีดาวถูกวางไว้ให้แล้ว 2 ดวง
 * และเบาะแส 3 ข้อ (บางข้ออ้างดาวด้วยลักษณะ เช่น "ดาวที่มีวงแหวนเด่นชัด" ต้องใช้ความรู้ประกอบ)
 *
 * รับประกันจากตัวสร้างผัง: ดาวที่วางไว้ + เบาะแสทั้งหมด ให้คำตอบเดียวเท่านั้น (ตรวจครบทั้ง 720 ลำดับ)
 * และทุกเบาะแสจำเป็น (ตัดข้อใดข้อหนึ่งออกแล้วคำตอบไม่เหลือเดียว) คำตอบเดียวนั้นตรงกับลำดับจริงของระบบสุริยะ
 * ตัวตรวจ: เทียบกับคำตอบเดียวนี้ จึงเด็กที่รู้ลำดับจริงโดยไม่อ่านเบาะแสก็ผ่านได้ และเด็กที่ไม่รู้ก็อนุมานได้จากเบาะแส
 */
import { type HintTier, type PuzzleModule, type ValidateResult, makeRng, fnv1a, PUZZLE_VERSION, type Rng } from './core.ts';
import { PLANETS, type PlanetDef } from './content.ts';

export interface ObservatoryParams {
  bodies: number;
  fixedCount: number;
  clueCount: number;
  maxClues: number;
  /** อย่างน้อยกี่เบาะแสที่ต้องอ้างดาวด้วยลักษณะ (ไม่ใช่ชื่อ) เมื่อทำได้ */
  attrClueMin: number;
}
export const OBSERVATORY_DEFAULTS: ObservatoryParams = { bodies: 6, fixedCount: 2, clueCount: 3, maxClues: 4, attrClueMin: 1 };

type DescKind = 'name' | 'largest' | 'smallest' | 'rings' | 'rocky' | 'gas' | 'ice';
interface Descriptor { kind: DescKind; planetId: string; label: string }

export type Clue =
  | { kind: 'pos'; a: Descriptor; slot: number }
  | { kind: 'before'; a: Descriptor; b: Descriptor }
  | { kind: 'next'; a: Descriptor; b: Descriptor };

export interface ObservatoryPuzzle {
  kind: 'observatory';
  version: number;
  seed: number;
  params: ObservatoryParams;
  /** ดาวทั้ง 6 เรียงตามลำดับจริง (เฉลย เซิร์ฟเวอร์เท่านั้น) */
  solution: string[];
  fixed: { slot: number; planetId: string }[];
  clues: Clue[];
  /** ลำดับของดาวในถาดที่ส่งให้เด็ก (สลับแล้ว) */
  tray: string[];
}
export interface ObservatoryPublic {
  kind: 'observatory';
  version: number;
  slots: number;
  fixed: { slot: number; planetId: string }[];
  tray: { id: string; label: string }[];
  clues: { id: string; text: string }[];
}
export interface ObservatoryAnswer { order: string[] }
export interface ObservatoryHint {
  tier: HintTier;
  key: 'observatory.general' | 'observatory.where' | 'observatory.show';
  slot?: number | null;
  planetId?: string;
  label?: string;
}

const PLANET_BY_ID = new Map(PLANETS.map((p) => [p.id, p]));
const planetName = (id: string): string => {
  const l = (PLANET_BY_ID.get(id) as PlanetDef).label;
  return l === 'โลก' ? l : `ดาว${l}`;
};
const slotOf = (order: string[], id: string): number => order.indexOf(id);

function permutations(n: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const rec = (): void => {
    if (cur.length === n) { out.push(cur.slice()); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; cur.push(i); rec(); cur.pop(); used[i] = false;
    }
  };
  rec();
  return out;
}
const PERM_CACHE = new Map<number, number[][]>();
const permsOf = (n: number): number[][] => {
  let p = PERM_CACHE.get(n);
  if (!p) { p = permutations(n); PERM_CACHE.set(n, p); }
  return p;
};

/** ตรวจว่าลำดับ (perm[slot] = ดัชนีดาวในชุด ids) ตรงกับเบาะแสหรือไม่ */
function satisfies(perm: number[], ids: string[], clue: Clue): boolean {
  const idx = (id: string): number => perm.indexOf(ids.indexOf(id));
  if (clue.kind === 'pos') return idx(clue.a.planetId) === clue.slot;
  if (clue.kind === 'before') return idx(clue.a.planetId) < idx(clue.b.planetId);
  return idx(clue.a.planetId) + 1 === idx(clue.b.planetId);
}

function countSolutions(ids: string[], fixed: { slot: number; planetId: string }[], clues: Clue[], limit = 2): number {
  let n = 0;
  for (const perm of permsOf(ids.length)) {
    if (!fixed.every((f) => perm[f.slot] === ids.indexOf(f.planetId))) continue;
    if (!clues.every((c) => satisfies(perm, ids, c))) continue;
    if (++n >= limit) break;
  }
  return n;
}

function descriptorsFor(set: PlanetDef[], planet: PlanetDef): Descriptor[] {
  const out: Descriptor[] = [{ kind: 'name', planetId: planet.id, label: planetName(planet.id) }];
  const biggest = set.reduce((a, b) => (b.diameterKm > a.diameterKm ? b : a));
  const smallest = set.reduce((a, b) => (b.diameterKm < a.diameterKm ? b : a));
  if (biggest.id === planet.id) out.push({ kind: 'largest', planetId: planet.id, label: 'ดาวที่ใหญ่ที่สุดในหกดวงนี้' });
  if (smallest.id === planet.id) out.push({ kind: 'smallest', planetId: planet.id, label: 'ดาวที่เล็กที่สุดในหกดวงนี้' });
  if (planet.bigRings && set.filter((s) => s.bigRings).length === 1) out.push({ kind: 'rings', planetId: planet.id, label: 'ดาวที่มีวงแหวนเด่นชัด' });
  const sameType = set.filter((s) => s.type === planet.type);
  if (sameType.length === 1) {
    const label = planet.type === 'rocky' ? 'ดาวเคราะห์หินดวงเดียวในกลุ่มนี้' : planet.type === 'gas' ? 'ดาวก๊าซยักษ์ดวงเดียวในกลุ่มนี้' : 'ดาวยักษ์น้ำแข็งดวงเดียวในกลุ่มนี้';
    out.push({ kind: planet.type, planetId: planet.id, label });
  }
  return out;
}

function clueText(c: Clue): string {
  if (c.kind === 'pos') return `${c.a.label} อยู่ลำดับที่ ${c.slot + 1} นับจากดวงอาทิตย์ (ในหกดวงนี้)`;
  if (c.kind === 'before') return `${c.a.label} อยู่ใกล้ดวงอาทิตย์กว่า ${c.b.label}`;
  return `${c.a.label} อยู่ติดกับ ${c.b.label} และอยู่ด้านใกล้ดวงอาทิตย์กว่า`;
}
const usesAttribute = (c: Clue): boolean => c.a.kind !== 'name' || (c.kind !== 'pos' && c.b.kind !== 'name');

function candidateClues(rng: Rng, set: PlanetDef[], order: string[]): Clue[] {
  const desc = (p: PlanetDef): Descriptor => rng.pick(descriptorsFor(set, p));
  const out: Clue[] = [];
  for (const a of set) out.push({ kind: 'pos', a: desc(a), slot: slotOf(order, a.id) });
  for (const a of set) {
    for (const b of set) {
      if (a.id === b.id) continue;
      const ia = slotOf(order, a.id);
      const ib = slotOf(order, b.id);
      if (ia < ib) out.push({ kind: 'before', a: desc(a), b: desc(b) });
      if (ia + 1 === ib) out.push({ kind: 'next', a: desc(a), b: desc(b) });
    }
  }
  return out;
}

export function createObservatoryPuzzle(overrides: Partial<ObservatoryParams> = {}): PuzzleModule<ObservatoryPuzzle, ObservatoryPublic, ObservatoryAnswer, ObservatoryHint> {
  const params: ObservatoryParams = { ...OBSERVATORY_DEFAULTS, ...overrides };
  if (params.bodies > PLANETS.length || params.fixedCount >= params.bodies) throw new Error('observatory: invalid params');

  const generate = (seed: number): ObservatoryPuzzle => {
    const rng = makeRng(seed);
    for (let outer = 0; outer < 200; outer++) {
      // เลือกดาว 6 ดวง คงลำดับจริง (PLANETS เรียงใกล้ -> ไกลอยู่แล้ว)
      const picked = rng.shuffle(PLANETS.map((_, i) => i)).slice(0, params.bodies).sort((a, b) => a - b);
      const set = picked.map((i) => PLANETS[i] as PlanetDef);
      const order = set.map((p) => p.id);
      const fixedSlots = rng.shuffle(order.map((_, i) => i)).slice(0, params.fixedCount).sort((a, b) => a - b);
      const fixed = fixedSlots.map((slot) => ({ slot, planetId: order[slot] as string }));
      const pool = candidateClues(rng, set, order);
      for (let n = params.clueCount; n <= params.maxClues; n++) {
        for (let attempt = 0; attempt < 400; attempt++) {
          const clues = rng.shuffle(pool).slice(0, n);
          if (clues.filter(usesAttribute).length < params.attrClueMin) continue;
          if (countSolutions(order, fixed, clues) !== 1) continue;
          // ทุกเบาะแสต้องจำเป็น
          if (!clues.every((_, i) => countSolutions(order, fixed, clues.filter((__, j) => j !== i)) > 1)) continue;
          let tray = rng.shuffle(order);
          for (let g = 0; g < 10 && tray.every((id, i) => id === order[i]); g++) tray = rng.shuffle(order);
          return { kind: 'observatory', version: PUZZLE_VERSION, seed, params, solution: order, fixed, clues, tray };
        }
      }
    }
    throw new Error('observatory: could not generate a uniquely solvable puzzle');
  };

  const publicView = (p: ObservatoryPuzzle): ObservatoryPublic => ({
    kind: 'observatory', version: p.version, slots: p.solution.length,
    fixed: p.fixed.map((f) => ({ ...f })),
    tray: p.tray.map((id) => ({ id, label: (PLANET_BY_ID.get(id) as PlanetDef).label })),
    clues: p.clues.map((c, i) => ({ id: `c${i + 1}`, text: clueText(c) })),
  });

  const wrongSlotsOf = (p: ObservatoryPuzzle, ans: ObservatoryAnswer | null): number[] => {
    const n = p.solution.length;
    const order = ans && Array.isArray(ans.order) ? ans.order : [];
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (order[i] !== p.solution[i]) out.push(i);
    return out;
  };

  const validate = (p: ObservatoryPuzzle, ans: ObservatoryAnswer): ValidateResult => {
    if (!ans || !Array.isArray(ans.order)) return { ok: false, wrong: [], reason: 'malformed' };
    if (ans.order.length !== p.solution.length) return { ok: false, wrong: [], reason: 'wrong-length' };
    const known = new Set(p.solution);
    const seen = new Set<string>();
    const dupSlots: string[] = [];
    ans.order.forEach((id, i) => {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) dupSlots.push(`slot:${i}`);
      else seen.add(id);
    });
    if (dupSlots.length > 0) return { ok: false, wrong: dupSlots, reason: 'invalid-or-duplicate' };
    if (!p.fixed.every((f) => ans.order[f.slot] === f.planetId)) return { ok: false, wrong: p.fixed.filter((f) => ans.order[f.slot] !== f.planetId).map((f) => `slot:${f.slot}`), reason: 'moved-fixed' };
    const w = wrongSlotsOf(p, ans);
    return { ok: w.length === 0, wrong: w.map((i) => `slot:${i}`), reason: w.length ? 'wrong-order' : undefined };
  };

  const hint = (p: ObservatoryPuzzle, ans: ObservatoryAnswer | null, tier: HintTier): ObservatoryHint => {
    if (tier === 1) return { tier, key: 'observatory.general' };
    const fixedSlots = new Set(p.fixed.map((f) => f.slot));
    const first = wrongSlotsOf(p, ans).find((i) => !fixedSlots.has(i));
    if (tier === 2) return { tier, key: 'observatory.where', slot: first ?? null };
    if (first === undefined) return { tier, key: 'observatory.show', slot: null };
    const id = p.solution[first] as string;
    return { tier, key: 'observatory.show', slot: first, planetId: id, label: (PLANET_BY_ID.get(id) as PlanetDef).label };
  };

  const fingerprint = (p: ObservatoryPuzzle): string => fnv1a(JSON.stringify([p.solution, p.fixed, p.clues.map(clueText)]));

  return { kind: 'observatory', generate, publicView, validate, hint, fingerprint };
}

export const observatory = createObservatoryPuzzle();
