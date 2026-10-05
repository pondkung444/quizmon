/**
 * พัซเซิลบ่อน้ำ (วิทยาศาสตร์ทั่วไป: วัฏจักรน้ำ)
 * วิธีเล่น: กริด 4x4 มี "ทะเล" ต้นทาง "ทะเล" ปลายทาง และสถานี 4 จุด (ระเหย ควบแน่น ฝนตก ไหลสะสม)
 * เป็นชิ้นท่อสำเร็จรูปที่ล็อกทิศไว้ เด็กเอาท่อตรง/ท่อโค้งจากถาดมาวางและหมุนให้น้ำไหลผ่านสถานีตามลำดับถึงปลายทาง
 * ถาดมีท่อพอดีกับที่ต้องใช้ บวกท่อหลอก 2 ชิ้น
 *
 * ตัวตรวจ: จำลองการไหลของน้ำเซลล์ต่อเซลล์ (ทางไหลถูกกำหนดแน่นอนเพราะทุกชิ้นมีช่องเปิด 2 ด้าน)
 * ผ่านเมื่อน้ำถึงปลายทางโดยผ่านสถานีครบตามลำดับ ไม่ต้องตรงกับทางเฉลย คำตอบอื่นที่ถูกกติกาก็ผ่าน
 */
import { type HintTier, type PuzzleModule, type ValidateResult, makeRng, fnv1a, PUZZLE_VERSION, type Rng } from './core.ts';
import { POND_CONTENT } from './content.ts';

/** ทิศ: 0 เหนือ 1 ตะวันออก 2 ใต้ 3 ตะวันตก */
const DR = [-1, 0, 1, 0] as const;
const DC = [0, 1, 0, -1] as const;

export type PipeKind = 'I' | 'L';
export interface Tile { r: number; c: number; kind: PipeKind; rot: number }

export interface PondParams {
  w: number;
  h: number;
  pathLenMin: number;
  pathLenMax: number;
  decoys: number;
}
export const POND_DEFAULTS: PondParams = { w: 4, h: 4, pathLenMin: 9, pathLenMax: 12, decoys: 2 };

export interface FixedCell {
  r: number;
  c: number;
  role: 'source' | 'sink' | 'station';
  /** ทิศที่เปิดอยู่ (source/sink มี 1 ทิศ, station มี 2 ทิศ) */
  sides: number[];
  /** เฉพาะ station: ลำดับในวัฏจักร 0..3 */
  order?: number;
  label: string;
  /** เฉพาะ station: ชนิดและการหมุนของชิ้นท่อ ไว้วาดภาพ */
  kind?: PipeKind;
  rot?: number;
}

export interface PondPuzzle {
  kind: 'pond';
  version: number;
  seed: number;
  params: PondParams;
  fixed: FixedCell[];
  tray: { I: number; L: number };
  /** เฉลย (เซิร์ฟเวอร์เท่านั้น): ชิ้นท่อที่ต้องวาง เรียงตามลำดับทางไหล */
  solution: Tile[];
}

export interface PondPublic {
  kind: 'pond';
  version: number;
  w: number;
  h: number;
  fixed: FixedCell[];
  tray: { I: number; L: number };
}
export interface PondAnswer { tiles: Tile[] }
export interface PondHint {
  tier: HintTier;
  key: 'pond.general' | 'pond.where' | 'pond.show';
  cell?: { r: number; c: number } | null;
  tile?: Tile;
}

export function openings(kind: PipeKind, rot: number): number[] {
  const r = ((rot % 4) + 4) % 4;
  const base = kind === 'I' ? [0, 2] : [0, 1];
  return base.map((d) => (d + r) % 4).sort((a, b) => a - b);
}
const sameSides = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

function dirBetween(a: [number, number], b: [number, number]): number {
  for (let d = 0; d < 4; d++) if (a[0] + (DR[d] as number) === b[0] && a[1] + (DC[d] as number) === b[1]) return d;
  throw new Error('cells not adjacent');
}

function pieceForSides(sides: number[]): { kind: PipeKind; rot: number } {
  const want = sides.slice().sort((a, b) => a - b);
  for (const kind of ['I', 'L'] as PipeKind[]) {
    for (let rot = 0; rot < 4; rot++) if (sameSides(openings(kind, rot), want)) return { kind, rot };
  }
  throw new Error('no piece for sides');
}

function randomPath(rng: Rng, w: number, h: number, len: number): [number, number][] | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const start: [number, number] = [rng.int(0, h - 1), rng.int(0, w - 1)];
    const seen = new Set<number>([start[0] * w + start[1]]);
    const path: [number, number][] = [start];
    let budget = 20000;
    const dfs = (): boolean => {
      if (path.length === len) return true;
      if (budget-- <= 0) return false;
      const [r, c] = path[path.length - 1] as [number, number];
      for (const d of rng.shuffle([0, 1, 2, 3])) {
        const nr = r + (DR[d] as number);
        const nc = c + (DC[d] as number);
        if (nr < 0 || nc < 0 || nr >= h || nc >= w || seen.has(nr * w + nc)) continue;
        seen.add(nr * w + nc);
        path.push([nr, nc]);
        if (dfs()) return true;
        path.pop();
        seen.delete(nr * w + nc);
      }
      return false;
    };
    if (dfs()) return path;
  }
  return null;
}

interface TraceResult {
  ok: boolean;
  /** เซลล์ที่น้ำไปต่อไม่ได้ (หรือสถานีที่ผิดลำดับ) */
  broken: { r: number; c: number } | null;
  reason: string;
}

function structuralErrors(p: PondPuzzle, ans: PondAnswer): { r: number; c: number; reason: string } | null {
  const fixedKeys = new Set(p.fixed.map((f) => f.r * p.params.w + f.c));
  const used = new Set<number>();
  const count = { I: 0, L: 0 };
  for (const t of ans.tiles) {
    if (!Number.isInteger(t.r) || !Number.isInteger(t.c) || !Number.isInteger(t.rot)) return { r: -1, c: -1, reason: 'non-integer' };
    if (t.kind !== 'I' && t.kind !== 'L') return { r: t.r, c: t.c, reason: 'bad-kind' };
    if (t.r < 0 || t.c < 0 || t.r >= p.params.h || t.c >= p.params.w) return { r: t.r, c: t.c, reason: 'out-of-bounds' };
    const k = t.r * p.params.w + t.c;
    if (fixedKeys.has(k)) return { r: t.r, c: t.c, reason: 'on-fixed-cell' };
    if (used.has(k)) return { r: t.r, c: t.c, reason: 'duplicate-cell' };
    used.add(k);
    count[t.kind]++;
  }
  if (count.I > p.tray.I || count.L > p.tray.L) {
    const t = ans.tiles[ans.tiles.length - 1];
    return { r: t ? t.r : -1, c: t ? t.c : -1, reason: 'tray-exceeded' };
  }
  return null;
}

function trace(p: PondPuzzle, tiles: Tile[]): TraceResult {
  const { w, h } = p.params;
  const grid = new Map<number, { sides: number[]; fixed?: FixedCell }>();
  for (const f of p.fixed) grid.set(f.r * w + f.c, { sides: f.sides, fixed: f });
  for (const t of tiles) grid.set(t.r * w + t.c, { sides: openings(t.kind, t.rot) });

  const source = p.fixed.find((f) => f.role === 'source') as FixedCell;
  let cur = { r: source.r, c: source.c };
  let dir = source.sides[0] as number;
  let hit = 0;
  const seen = new Set<number>([cur.r * w + cur.c]);
  const isPlayer = (r: number, c: number): boolean => !grid.get(r * w + c)?.fixed;

  for (let step = 0; step <= w * h + 2; step++) {
    const nr = cur.r + (DR[dir] as number);
    const nc = cur.c + (DC[dir] as number);
    if (nr < 0 || nc < 0 || nr >= h || nc >= w) return { ok: false, broken: cur, reason: 'leak-off-grid' };
    const cell = grid.get(nr * w + nc);
    if (!cell) return { ok: false, broken: { r: nr, c: nc }, reason: 'gap' };
    const entering = (dir + 2) % 4;
    if (!cell.sides.includes(entering)) {
      const blame = isPlayer(nr, nc) ? { r: nr, c: nc } : isPlayer(cur.r, cur.c) ? cur : { r: nr, c: nc };
      return { ok: false, broken: blame, reason: 'mismatch' };
    }
    const key = nr * w + nc;
    if (seen.has(key)) return { ok: false, broken: { r: nr, c: nc }, reason: 'loop' };
    seen.add(key);
    cur = { r: nr, c: nc };
    if (cell.fixed?.role === 'sink') {
      if (hit === 4) return { ok: true, broken: null, reason: 'ok' };
      const missed = p.fixed.find((f) => f.role === 'station' && (f.order as number) === hit) as FixedCell;
      return { ok: false, broken: { r: missed.r, c: missed.c }, reason: 'skipped-station' };
    }
    if (cell.fixed?.role === 'station') {
      if ((cell.fixed.order as number) !== hit) return { ok: false, broken: { r: nr, c: nc }, reason: 'wrong-order' };
      hit++;
    }
    dir = cell.sides.find((s) => s !== entering) as number;
  }
  return { ok: false, broken: cur, reason: 'too-long' };
}

export function createPondPuzzle(overrides: Partial<PondParams> = {}): PuzzleModule<PondPuzzle, PondPublic, PondAnswer, PondHint> {
  const params: PondParams = { ...POND_DEFAULTS, ...overrides };
  if (params.pathLenMin < 7 || params.pathLenMax > params.w * params.h) throw new Error('pond: invalid path length range');
  if (POND_CONTENT.stations.length !== 4) throw new Error('pond: content must define exactly 4 stations');

  const generate = (seed: number): PondPuzzle => {
    const rng = makeRng(seed);
    for (let attempt = 0; attempt < 50; attempt++) {
      const len = rng.int(params.pathLenMin, params.pathLenMax);
      const path = randomPath(rng, params.w, params.h, len);
      if (!path) continue;
      // เลือกสถานี 4 จุดจากเซลล์ในเส้นทาง (ไม่รวมต้นทาง/ปลายทาง) เรียงตามลำดับทางไหล
      const interior = Array.from({ length: len - 2 }, (_, i) => i + 1);
      const stationIdx = rng.shuffle(interior).slice(0, 4).sort((a, b) => a - b);
      const fixed: FixedCell[] = [];
      const solution: Tile[] = [];
      const tray = { I: 0, L: 0 };
      for (let i = 0; i < len; i++) {
        const [r, c] = path[i] as [number, number];
        if (i === 0) {
          fixed.push({ r, c, role: 'source', sides: [dirBetween([r, c], path[1] as [number, number])], label: POND_CONTENT.sourceLabel });
          continue;
        }
        if (i === len - 1) {
          fixed.push({ r, c, role: 'sink', sides: [dirBetween([r, c], path[len - 2] as [number, number])], label: POND_CONTENT.sinkLabel });
          continue;
        }
        const prev = path[i - 1] as [number, number];
        const next = path[i + 1] as [number, number];
        const sides = [dirBetween([r, c], prev), dirBetween([r, c], next)];
        const piece = pieceForSides(sides);
        const order = stationIdx.indexOf(i);
        if (order >= 0) {
          fixed.push({ r, c, role: 'station', sides: sides.slice().sort((a, b) => a - b), order, label: (POND_CONTENT.stations[order] as { label: string }).label, kind: piece.kind, rot: piece.rot });
        } else {
          solution.push({ r, c, kind: piece.kind, rot: piece.rot });
          tray[piece.kind]++;
        }
      }
      for (let d = 0; d < params.decoys; d++) tray[rng.pick(['I', 'L'] as PipeKind[])]++;
      const puzzle: PondPuzzle = { kind: 'pond', version: PUZZLE_VERSION, seed, params, fixed, tray, solution };
      // ตรวจเองก่อนส่งออก: เฉลยต้องผ่านตัวตรวจของระบบจริง
      if (trace(puzzle, solution).ok) return puzzle;
    }
    throw new Error('pond: could not generate a valid puzzle');
  };

  const publicView = (p: PondPuzzle): PondPublic => ({
    kind: 'pond', version: p.version, w: p.params.w, h: p.params.h,
    fixed: p.fixed.map((f) => ({ ...f })), tray: { ...p.tray },
  });

  const validate = (p: PondPuzzle, ans: PondAnswer): ValidateResult => {
    if (!ans || !Array.isArray(ans.tiles)) return { ok: false, wrong: [], reason: 'malformed' };
    const bad = structuralErrors(p, ans);
    if (bad) return { ok: false, wrong: bad.r >= 0 ? [`cell:${bad.r},${bad.c}`] : [], reason: bad.reason };
    const t = trace(p, ans.tiles);
    if (t.ok) return { ok: true, wrong: [] };
    return { ok: false, wrong: t.broken ? [`cell:${t.broken.r},${t.broken.c}`] : [], reason: t.reason };
  };

  const hint = (p: PondPuzzle, ans: PondAnswer | null, tier: HintTier): PondHint => {
    if (tier === 1) return { tier, key: 'pond.general' };
    const tiles = ans && Array.isArray(ans.tiles) && !structuralErrors(p, ans) ? ans.tiles : [];
    if (tier === 2) {
      const t = trace(p, tiles);
      return { tier, key: 'pond.where', cell: t.broken };
    }
    // ขั้น 3: เผยท่อชิ้นแรก (ตามทางไหล) ที่ยังไม่ถูกวางให้ตรงเฉลย ไม่เผยทั้งหมด
    const missing = p.solution.find((s) => {
      const placed = tiles.find((t) => t.r === s.r && t.c === s.c);
      return !placed || !sameSides(openings(placed.kind, placed.rot), openings(s.kind, s.rot));
    });
    return missing ? { tier, key: 'pond.show', tile: { ...missing } } : { tier, key: 'pond.show' };
  };

  const fingerprint = (p: PondPuzzle): string =>
    fnv1a(JSON.stringify([p.fixed.map((f) => [f.r, f.c, f.role, f.sides, f.order ?? -1]), p.solution.map((s) => [s.r, s.c])]));

  return { kind: 'pond', generate, publicView, validate, hint, fingerprint };
}

export const pond = createPondPuzzle();
