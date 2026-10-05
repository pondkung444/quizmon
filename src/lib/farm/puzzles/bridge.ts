/**
 * พัซเซิลสะพาน (ฟิสิกส์: แรงและสมดุล / โมเมนต์)
 * วิธีเล่น: คานมีจุดหมุนตรงกลาง ตำแหน่ง -5..-1 ด้านซ้าย และ 1..5 ด้านขวา มีน้ำหนักถูกล็อกบนคานอยู่แล้ว 1 ก้อน
 * เด็กได้น้ำหนักเพิ่ม 4 ก้อน ต้องวางทุกก้อนลงตำแหน่งที่ว่าง (ตำแหน่งละ 1 ก้อน) ให้คานสมดุล
 *
 * ตัวตรวจ: โมเมนต์รวม = ผลบวกของ (น้ำหนัก x ตำแหน่งที่มีเครื่องหมาย) ต้องเท่ากับ 0 ใช้จำนวนเต็มล้วน ไม่มีทศนิยม
 * ผ่านเมื่อสมดุลจริง ไม่ผูกกับเฉลยข้อเดียว (มีหลายคำตอบได้ ตัวสร้างผังคุมจำนวนคำตอบไว้ไม่ให้มากจนเดาง่าย)
 */
import { type HintTier, type PuzzleModule, type ValidateResult, makeRng, fnv1a, PUZZLE_VERSION } from './core.ts';

export interface BridgeParams {
  maxPos: number;
  weightCount: number;
  weightMin: number;
  weightMax: number;
  fixedWeightMin: number;
  fixedWeightMax: number;
  minSolutions: number;
  maxSolutions: number;
}
export const BRIDGE_DEFAULTS: BridgeParams = {
  maxPos: 5,
  weightCount: 4,
  weightMin: 1,
  weightMax: 5,
  fixedWeightMin: 2,
  fixedWeightMax: 5,
  minSolutions: 2,
  maxSolutions: 24,
};

export interface Placement { weightId: string; pos: number }

export interface BridgePuzzle {
  kind: 'bridge';
  version: number;
  seed: number;
  params: BridgeParams;
  fixed: { value: number; pos: number };
  weights: { id: string; value: number }[];
  /** เฉลยทุกแบบ (เซิร์ฟเวอร์เท่านั้น) ตัดแบบที่ต่างกันแค่สลับก้อนน้ำหนักค่าเท่ากันออกแล้ว */
  solutions: Placement[][];
}
export interface BridgePublic {
  kind: 'bridge';
  version: number;
  maxPos: number;
  fixed: { value: number; pos: number };
  weights: { id: string; value: number }[];
}
export interface BridgeAnswer { placements: Placement[] }
export interface BridgeHint {
  tier: HintTier;
  key: 'bridge.general' | 'bridge.tilt' | 'bridge.show';
  /** ขั้น 2: ด้านที่หนักกว่า ('left' | 'right') หรือ 'incomplete' ถ้ายังวางไม่ครบ */
  heavier?: 'left' | 'right' | 'balanced' | 'incomplete';
  /** ขั้น 3: เผยก้อนน้ำหนักหนึ่งก้อนกับตำแหน่งที่ถูก */
  placement?: Placement;
}

function enumerateSolutions(fixed: { value: number; pos: number }, weights: { id: string; value: number }[], maxPos: number, cap: number): Placement[][] {
  const free: number[] = [];
  for (let p = -maxPos; p <= maxPos; p++) if (p !== 0 && p !== fixed.pos) free.push(p);
  const base = fixed.value * fixed.pos;
  const out: Placement[][] = [];
  const seen = new Set<string>();
  const used = new Array<boolean>(free.length).fill(false);
  const cur: Placement[] = [];
  const dfs = (i: number, torque: number): void => {
    if (out.length > cap) return;
    if (i === weights.length) {
      if (torque !== 0) return;
      const canon = cur.map((x) => `${(weights.find((w) => w.id === x.weightId) as { value: number }).value}@${x.pos}`).sort().join(',');
      if (seen.has(canon)) return;
      seen.add(canon);
      out.push(cur.map((x) => ({ ...x })));
      return;
    }
    const w = weights[i] as { id: string; value: number };
    for (let k = 0; k < free.length; k++) {
      if (used[k]) continue;
      used[k] = true;
      cur.push({ weightId: w.id, pos: free[k] as number });
      dfs(i + 1, torque + w.value * (free[k] as number));
      cur.pop();
      used[k] = false;
    }
  };
  dfs(0, base);
  return out;
}

function torqueOf(p: BridgePuzzle, placements: Placement[]): number {
  const vals = new Map(p.weights.map((w) => [w.id, w.value]));
  return p.fixed.value * p.fixed.pos + placements.reduce((s, x) => s + (vals.get(x.weightId) as number) * x.pos, 0);
}

function structural(p: BridgePuzzle, ans: BridgeAnswer): { ids: string[]; reason: string } | null {
  const ids = new Set(p.weights.map((w) => w.id));
  const seenW = new Set<string>();
  const seenPos = new Set<number>();
  const wrong: string[] = [];
  let reason = '';
  for (const x of ans.placements) {
    const okPos = Number.isInteger(x.pos) && x.pos !== 0 && Math.abs(x.pos) <= p.params.maxPos && x.pos !== p.fixed.pos;
    if (!ids.has(x.weightId)) { reason = 'unknown-weight'; continue; }
    if (seenW.has(x.weightId)) { wrong.push(`w:${x.weightId}`); reason = 'duplicate-weight'; continue; }
    seenW.add(x.weightId);
    if (!okPos) { wrong.push(`w:${x.weightId}`); reason = reason || 'bad-position'; continue; }
    if (seenPos.has(x.pos)) { wrong.push(`w:${x.weightId}`); reason = reason || 'position-taken'; continue; }
    seenPos.add(x.pos);
  }
  if (seenW.size !== p.weights.length && !reason) reason = 'incomplete';
  return reason ? { ids: wrong, reason } : null;
}

export function createBridgePuzzle(overrides: Partial<BridgeParams> = {}): PuzzleModule<BridgePuzzle, BridgePublic, BridgeAnswer, BridgeHint> {
  const params: BridgeParams = { ...BRIDGE_DEFAULTS, ...overrides };
  if (params.weightCount > 2 * params.maxPos - 1) throw new Error('bridge: not enough positions');

  const generate = (seed: number): BridgePuzzle => {
    const rng = makeRng(seed);
    for (let attempt = 0; attempt < 2000; attempt++) {
      const side = rng.pick([-1, 1]);
      const fixed = { value: rng.int(params.fixedWeightMin, params.fixedWeightMax), pos: side * rng.int(1, params.maxPos) };
      const weights = Array.from({ length: params.weightCount }, (_, i) => ({ id: `w${i + 1}`, value: rng.int(params.weightMin, params.weightMax) }));
      const solutions = enumerateSolutions(fixed, weights, params.maxPos, params.maxSolutions);
      if (solutions.length >= params.minSolutions && solutions.length <= params.maxSolutions) {
        return { kind: 'bridge', version: PUZZLE_VERSION, seed, params, fixed, weights, solutions };
      }
    }
    throw new Error('bridge: could not generate a puzzle within solution-count limits');
  };

  const publicView = (p: BridgePuzzle): BridgePublic => ({
    kind: 'bridge', version: p.version, maxPos: p.params.maxPos, fixed: { ...p.fixed }, weights: p.weights.map((w) => ({ ...w })),
  });

  const validate = (p: BridgePuzzle, ans: BridgeAnswer): ValidateResult => {
    if (!ans || !Array.isArray(ans.placements)) return { ok: false, wrong: [], reason: 'malformed' };
    const bad = structural(p, ans);
    if (bad) return { ok: false, wrong: bad.ids, reason: bad.reason };
    const t = torqueOf(p, ans.placements);
    if (t === 0) return { ok: true, wrong: [] };
    return { ok: false, wrong: ['beam'], reason: t < 0 ? 'tilt-left' : 'tilt-right' };
  };

  const hint = (p: BridgePuzzle, ans: BridgeAnswer | null, tier: HintTier): BridgeHint => {
    if (tier === 1) return { tier, key: 'bridge.general' };
    const valid = ans && Array.isArray(ans.placements) && !structural(p, ans) ? ans.placements : null;
    if (tier === 2) {
      if (!valid) return { tier, key: 'bridge.tilt', heavier: 'incomplete' };
      const t = torqueOf(p, valid);
      return { tier, key: 'bridge.tilt', heavier: t === 0 ? 'balanced' : t < 0 ? 'left' : 'right' };
    }
    // ขั้น 3: เลือกเฉลยที่ตรงกับสิ่งที่เด็กวางไว้มากที่สุด แล้วเผยเพียงก้อนเดียวที่ยังไม่ตรง
    const vals = new Map(p.weights.map((w) => [w.id, w.value]));
    const mine = (ans && Array.isArray(ans.placements) ? ans.placements : []).filter((x) => vals.has(x.weightId));
    const matches = (sol: Placement[]): number =>
      sol.filter((s) => mine.some((m) => m.pos === s.pos && vals.get(m.weightId) === vals.get(s.weightId))).length;
    const best = p.solutions.slice().sort((a, b) => matches(b) - matches(a))[0] as Placement[];
    const missing = best.find((s) => !mine.some((m) => m.pos === s.pos && vals.get(m.weightId) === vals.get(s.weightId)));
    return missing ? { tier, key: 'bridge.show', placement: { ...missing } } : { tier, key: 'bridge.show' };
  };

  const fingerprint = (p: BridgePuzzle): string => fnv1a(JSON.stringify([p.fixed, p.weights.map((w) => w.value)]));

  return { kind: 'bridge', generate, publicView, validate, hint, fingerprint };
}

export const bridge = createBridgePuzzle();
