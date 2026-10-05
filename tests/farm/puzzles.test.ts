import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { makeRng, generateNext, PLANETS, FLOWER_CONTENT, createPondPuzzle, createFlowerPuzzle, createBridgePuzzle, createObservatoryPuzzle, pond, flower, bridge, observatory } from '../../src/lib/farm/puzzles/index.ts';
import { openings, type PondPuzzle, type Tile } from '../../src/lib/farm/puzzles/pond.ts';
import type { FlowerPuzzle, FlowerAnswer } from '../../src/lib/farm/puzzles/flower.ts';
import type { BridgePuzzle, BridgeAnswer } from '../../src/lib/farm/puzzles/bridge.ts';
import type { ObservatoryPuzzle, ObservatoryAnswer } from '../../src/lib/farm/puzzles/observatory.ts';

const N = Number(process.env.N ?? 3000);
let failures = 0;
const failed: string[] = [];
function check(cond: boolean, msg: string): void {
  if (!cond) { failures++; if (failed.length < 25) failed.push(msg); }
}
const hist = (arr: number[]): string => {
  const m = new Map<number, number>();
  arr.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
};
const timing: Record<string, number[]> = {};
function timed<T>(name: string, f: () => T): T {
  const t = performance.now();
  const r = f();
  (timing[name] ??= []).push(performance.now() - t);
  return r;
}
const FORBIDDEN = ['solution', 'solutions', 'needs', '"level"', 'path'];
function noLeak(name: string, pub: unknown): void {
  const s = JSON.stringify(pub);
  for (const k of FORBIDDEN) check(!s.includes(k), `${name}: public view leaks "${k}"`);
}

/* ===================== POND ===================== */
// อ็อราเคิลอิสระ: จำลองน้ำไหลด้วยการไล่ตามทิศ (เขียนแยกจากตัวตรวจจริง)
function pondOracle(p: PondPuzzle, tiles: Tile[]): boolean {
  const { w, h } = p.params;
  const cells = new Map<string, number[]>();
  const stationOrder = new Map<string, number>();
  let src: { r: number; c: number; s: number } | null = null;
  let sink = '';
  for (const f of p.fixed) {
    cells.set(`${f.r},${f.c}`, f.sides);
    if (f.role === 'station') stationOrder.set(`${f.r},${f.c}`, f.order as number);
    if (f.role === 'source') src = { r: f.r, c: f.c, s: f.sides[0] as number };
    if (f.role === 'sink') sink = `${f.r},${f.c}`;
  }
  for (const t of tiles) cells.set(`${t.r},${t.c}`, openings(t.kind, t.rot));
  if (!src) return false;
  const dr = [-1, 0, 1, 0], dc = [0, 1, 0, -1];
  let r = src.r, c = src.c, d = src.s, next = 0;
  for (let i = 0; i < 40; i++) {
    r += dr[d] as number; c += dc[d] as number;
    if (r < 0 || c < 0 || r >= h || c >= w) return false;
    const key = `${r},${c}`;
    const sides = cells.get(key);
    if (!sides || !sides.includes((d + 2) % 4)) return false;
    if (key === sink) return next === 4;
    const so = stationOrder.get(key);
    if (so !== undefined) { if (so !== next) return false; next++; }
    d = sides.find((x) => x !== (d + 2) % 4) as number;
  }
  return false;
}


/** ไล่ทุกเส้นทางน้ำที่สร้างได้จริงจากต้นทางถึงปลายทาง (ใช้ท่อไม่เกินถาด) แล้วแยกว่าเส้นไหนถูกกติกา */
function pondRoutes(p: PondPuzzle, cap = 4000): { tiles: Tile[]; legal: boolean }[] {
  const { w, h } = p.params;
  const dr = [-1, 0, 1, 0], dc = [0, 1, 0, -1];
  const fixed = new Map(p.fixed.map((f) => [f.r * w + f.c, f]));
  const src = p.fixed.find((f) => f.role === 'source') as (typeof p.fixed)[number];
  const out: { tiles: Tile[]; legal: boolean }[] = [];
  const seen = new Set<number>([src.r * w + src.c]);
  const tiles: Tile[] = [];
  const hits: number[] = [];
  const use = { I: 0, L: 0 };
  const dfs = (r: number, c: number, dir: number): void => {
    if (out.length >= cap) return;
    const nr = r + (dr[dir] as number), nc = c + (dc[dir] as number);
    if (nr < 0 || nc < 0 || nr >= h || nc >= w) return;
    const key = nr * w + nc;
    if (seen.has(key)) return;
    const entering = (dir + 2) % 4;
    const f = fixed.get(key);
    seen.add(key);
    if (f) {
      if (f.sides.includes(entering)) {
        if (f.role === 'sink') out.push({ tiles: tiles.slice(), legal: hits.length === 4 && hits.every((x, i) => x === i) });
        else {
          hits.push(f.order as number);
          dfs(nr, nc, f.sides.find((x) => x !== entering) as number);
          hits.pop();
        }
      }
    } else {
      for (let o = 0; o < 4; o++) {
        if (o === entering) continue;
        const kind = o === (entering + 2) % 4 ? 'I' : 'L';
        if (use[kind] >= p.tray[kind]) continue;
        let rot = -1;
        for (let k = 0; k < 4; k++) if (openings(kind, k).join() === [entering, o].sort((a, b) => a - b).join()) { rot = k; break; }
        use[kind]++; tiles.push({ r: nr, c: nc, kind, rot });
        dfs(nr, nc, o);
        tiles.pop(); use[kind]--;
      }
    }
    seen.delete(key);
  };
  dfs(src.r, src.c, src.sides[0] as number);
  return out;
}

function testPondDirected(): void {
  // ผังที่เขียนมือ: สถานีสองจุดอยู่ในแถวเดียวกัน แต่ลำดับวัฏจักรสลับกัน น้ำต้องไม่ผ่านแม้จะถึงปลายทางและผ่านครบ
  const params = { w: 4, h: 4, pathLenMin: 9, pathLenMax: 12, decoys: 2 };
  const mk = (orderA: number, orderB: number, orderC: number, orderD: number): PondPuzzle => ({
    kind: 'pond', version: 1, seed: 0, params,
    fixed: [
      { r: 0, c: 0, role: 'source', sides: [1], label: 's' },
      { r: 0, c: 1, role: 'station', sides: [1, 3], order: orderA, label: 'a', kind: 'I', rot: 1 },
      { r: 0, c: 2, role: 'station', sides: [1, 3], order: orderB, label: 'b', kind: 'I', rot: 1 },
      { r: 0, c: 3, role: 'station', sides: [2, 3], order: orderC, label: 'c', kind: 'L', rot: 2 },
      { r: 1, c: 3, role: 'station', sides: [0, 3], order: orderD, label: 'd', kind: 'L', rot: 3 },
      { r: 1, c: 2, role: 'sink', sides: [1], label: 'k' },
    ],
    tray: { I: 0, L: 0 }, solution: [],
  });
  check(pond.validate(mk(0, 1, 2, 3), { tiles: [] }).ok, 'pond directed: correct order rejected');
  const bad = pond.validate(mk(1, 0, 2, 3), { tiles: [] });
  check(!bad.ok && bad.reason === 'wrong-order', `pond directed: wrong order accepted (${bad.reason})`);
  const bad2 = pond.validate(mk(0, 1, 3, 2), { tiles: [] });
  check(!bad2.ok && bad2.reason === 'wrong-order', `pond directed: wrong order (end) accepted (${bad2.reason})`);
}

function testPond(): void {
  let illegalRoutes = 0, legalRoutes = 0, altLegal = 0, trayLimitTests = 0;
  const stats = { tiles: [] as number[], trayI: [] as number[], trayL: [] as number[] };
  const fps = new Set<string>();
  const rng = makeRng(777);
  for (let seed = 1; seed <= N; seed++) {
    const p = timed('pond', () => pond.generate(seed));
    check(JSON.stringify(pond.generate(seed)) === JSON.stringify(p), `pond ${seed}: not deterministic`);
    noLeak('pond', pond.publicView(p));
    fps.add(pond.fingerprint(p));
    stats.tiles.push(p.solution.length);
    stats.trayI.push(p.tray.I); stats.trayL.push(p.tray.L);
    check(p.fixed.filter((f) => f.role === 'station').length === 4, `pond ${seed}: stations != 4`);
    const sol = { tiles: p.solution };
    check(pond.validate(p, sol).ok, `pond ${seed}: solution rejected`);
    check(p.tray.I + p.tray.L === p.solution.length + p.params.decoys, `pond ${seed}: tray size`);
    // เฉลยบวกท่อหลอกที่วางนอกทางต้องยังผ่าน (คำตอบอื่นที่ถูกกติกา)
    const spareI = p.tray.I - p.solution.filter((t) => t.kind === 'I').length;
    const spareL = p.tray.L - p.solution.filter((t) => t.kind === 'L').length;
    const taken = new Set([...p.fixed, ...p.solution].map((x) => `${x.r},${x.c}`));
    const empties: [number, number][] = [];
    for (let r = 0; r < p.params.h; r++) for (let c = 0; c < p.params.w; c++) if (!taken.has(`${r},${c}`)) empties.push([r, c]);
    const extra: Tile[] = [];
    for (let i = 0; i < spareI && i < empties.length; i++) extra.push({ r: (empties[i] as [number, number])[0], c: (empties[i] as [number, number])[1], kind: 'I', rot: rng.int(0, 3) });
    for (let i = 0; i < spareL && spareI + i < empties.length; i++) extra.push({ r: (empties[spareI + i] as [number, number])[0], c: (empties[spareI + i] as [number, number])[1], kind: 'L', rot: rng.int(0, 3) });
    check(pond.validate(p, { tiles: [...p.solution, ...extra] }).ok, `pond ${seed}: spare tiles broke a valid answer`);
    // กลายพันธุ์: หมุนท่อหนึ่งชิ้นให้ช่องเปิดเปลี่ยน ต้องไม่ผ่าน
    const i = rng.int(0, p.solution.length - 1);
    const t = p.solution[i] as Tile;
    for (let k = 1; k <= 3; k++) {
      const same = openings(t.kind, t.rot).join() === openings(t.kind, t.rot + k).join();
      if (same) continue;
      const mut = p.solution.map((x, j) => (j === i ? { ...x, rot: x.rot + k } : x));
      check(!pond.validate(p, { tiles: mut }).ok, `pond ${seed}: rotated tile still accepted`);
    }
    // ขาดท่อหนึ่งชิ้น ต้องไม่ผ่าน และชี้เซลล์ที่น้ำหยุด
    const missing = p.solution.filter((_, j) => j !== i);
    const mv = pond.validate(p, { tiles: missing });
    check(!mv.ok && mv.wrong.length === 1, `pond ${seed}: missing tile not flagged`);
    check(!pond.validate(p, { tiles: [] }).ok, `pond ${seed}: empty accepted`);
    // วางท่อทับช่องที่ล็อก (ต้นทาง ปลายทาง สถานี) ต้องถูกปฏิเสธด้วยเหตุผลที่ถูกต้อง
    for (const f of p.fixed) {
      const r1 = pond.validate(p, { tiles: [...p.solution, { r: f.r, c: f.c, kind: 'I', rot: 0 }] });
      check(!r1.ok && r1.reason === 'on-fixed-cell' && r1.wrong.includes(`cell:${f.r},${f.c}`), `pond ${seed}: tile on fixed cell not rejected properly`);
    }
    // วางท่อเกินจำนวนในถาด (นอกเส้นทาง ไม่กระทบการไหล) ต้องไม่ผ่าน
    for (const kind of ['I', 'L'] as const) {
      const spare = p.tray[kind] - p.solution.filter((x) => x.kind === kind).length;
      const takenKeys = new Set([...p.fixed, ...p.solution].map((x) => `${x.r},${x.c}`));
      const free: [number, number][] = [];
      for (let r = 0; r < p.params.h; r++) for (let c = 0; c < p.params.w; c++) if (!takenKeys.has(`${r},${c}`)) free.push([r, c]);
      if (free.length >= spare + 1) {
        const over: Tile[] = free.slice(0, spare + 1).map(([r, c]) => ({ r, c, kind, rot: 0 }));
        check(!pond.validate(p, { tiles: [...p.solution, ...over] }).ok, `pond ${seed}: tray limit not enforced for ${kind}`);
        trayLimitTests++;
      }
    }
    // อ็อราเคิลเทียบกับตัวตรวจ บนคำตอบสุ่ม (ท่อสุ่มจากถาด ตำแหน่งสุ่ม)
    for (let k = 0; k < 6; k++) {
      const pool: ('I' | 'L')[] = [...Array(p.tray.I).fill('I'), ...Array(p.tray.L).fill('L')];
      const cnt = rng.int(0, pool.length);
      const cellsFree = rng.shuffle(empties.concat(p.solution.map((s) => [s.r, s.c] as [number, number])));
      const tiles: Tile[] = rng.shuffle(pool).slice(0, cnt).map((kind, j) => ({ r: (cellsFree[j] as [number, number])[0], c: (cellsFree[j] as [number, number])[1], kind, rot: rng.int(0, 3) }));
      check(pond.validate(p, { tiles }).ok === pondOracle(p, tiles), `pond ${seed}: validator != oracle on random answer`);
    }
    // ทุกเส้นทางที่สร้างได้จริง: เส้นที่ผ่านสถานีครบตามลำดับต้องผ่าน (รวมคำตอบอื่นนอกเหนือเฉลย) เส้นที่ข้ามสถานีหรือผิดลำดับต้องไม่ผ่าน
    if (seed <= 400) {
      for (const route of pondRoutes(p)) {
        const res = pond.validate(p, { tiles: route.tiles }).ok;
        check(res === route.legal, `pond ${seed}: route legality mismatch (legal=${route.legal}, accepted=${res})`);
        if (route.legal) { legalRoutes++; if (route.tiles.map((t) => `${t.r},${t.c}`).sort().join() !== p.solution.map((t) => `${t.r},${t.c}`).sort().join()) altLegal++; } else illegalRoutes++;
      }
    }
    // คำใบ้ขั้น 3 วนซ้ำต้องไปถึงคำตอบที่ถูกภายในจำนวนชิ้นเฉลย
    let cur: Tile[] = [];
    for (let step = 0; step < p.solution.length + 1 && !pond.validate(p, { tiles: cur }).ok; step++) {
      const h3 = pond.hint(p, { tiles: cur }, 3);
      if (!h3.tile) break;
      cur = cur.filter((x) => !(x.r === (h3.tile as Tile).r && x.c === (h3.tile as Tile).c)).concat([h3.tile]);
    }
    check(pond.validate(p, { tiles: cur }).ok, `pond ${seed}: tier-3 hints did not converge`);
    // ขั้น 2 ชี้เซลล์เมื่อมีท่อขาด
    check(pond.hint(p, { tiles: missing }, 2).cell != null, `pond ${seed}: tier-2 gave no cell`);
  }
  check(trayLimitTests > N / 2, 'pond: tray-limit test rarely exercised');
  check(illegalRoutes > 0, 'pond: test never produced an illegal route (test not meaningful)');
  console.log(`pond      เส้นทางน้ำที่ลองครบ: ถูกกติกา ${legalRoutes} (ต่างจากเฉลย ${altLegal}) ผิดกติกา ${illegalRoutes}`);
  console.log(`pond      ผังไม่ซ้ำ ${fps.size}/${N} | ท่อที่ต้องวาง ${hist(stats.tiles)} | ถาด I ${hist(stats.trayI)} L ${hist(stats.trayL)}`);
}

/* ===================== FLOWER ===================== */
function testFlower(): void {
  let wrongLevelTests = 0, reuseTests = 0;
  const fps = new Set<string>();
  const rng = makeRng(888);
  for (let seed = 1; seed <= N; seed++) {
    const p: FlowerPuzzle = timed('flower', () => flower.generate(seed));
    check(JSON.stringify(flower.generate(seed)) === JSON.stringify(p), `flower ${seed}: not deterministic`);
    noLeak('flower', flower.publicView(p));
    fps.add(flower.fingerprint(p));
    check(p.cards.length === 9 + p.params.distractors, `flower ${seed}: card count`);
    // เฉลยที่สร้างเอง: เลือกการ์ดที่ตรงปัจจัยและระดับ
    const used = new Set<string>();
    const slots: FlowerAnswer['slots'] = [];
    for (const pl of p.plots) for (const f of p.factors) {
      const need = p.needs[`${pl.index}:${f.id}`];
      const card = p.cards.find((c) => !used.has(c.id) && c.factorId === f.id && c.level === need);
      check(!!card, `flower ${seed}: no card for slot`);
      if (card) { used.add(card.id); slots.push({ plot: pl.index, factorId: f.id, cardId: card.id }); }
    }
    check(flower.validate(p, { slots }).ok, `flower ${seed}: solution rejected`);
    // สลับการ์ดระดับเดียวกัน ต้องยังผ่าน
    const byKey = new Map<string, number[]>();
    slots.forEach((s, i) => { const k = `${s.factorId}:${p.needs[`${s.plot}:${s.factorId}`]}`; byKey.set(k, [...(byKey.get(k) ?? []), i]); });
    const swappable = [...byKey.values()].find((v) => v.length >= 2);
    if (swappable) {
      const [a, b] = swappable as [number, number];
      const sw = slots.map((s, i) => (i === a ? { ...s, cardId: (slots[b] as { cardId: string }).cardId } : i === b ? { ...s, cardId: (slots[a] as { cardId: string }).cardId } : s));
      check(flower.validate(p, { slots: sw }).ok, `flower ${seed}: swapping equal cards rejected`);
    }
    // ใส่การ์ดหลอกในช่องใดช่องหนึ่ง ต้องไม่ผ่าน
    const decoy = p.cards.find((c) => c.factorId === null) as { id: string };
    const k = rng.int(0, slots.length - 1);
    check(!flower.validate(p, { slots: slots.map((s, i) => (i === k ? { ...s, cardId: decoy.id } : s)) }).ok, `flower ${seed}: decoy accepted`);
    // ใช้การ์ดซ้ำสองช่อง ต้องไม่ผ่าน
    check(!flower.validate(p, { slots: slots.map((s, i) => (i === 1 ? { ...s, cardId: (slots[0] as { cardId: string }).cardId } : s)) }).ok || (slots[0] as { cardId: string }).cardId === (slots[1] as { cardId: string }).cardId, `flower ${seed}: reused card accepted`);
    // ใช้การ์ดใบเดียวกันในสองช่องที่ต้องการปัจจัยและระดับเดียวกัน (ระดับถูกทั้งคู่) ต้องไม่ผ่านเพราะใช้การ์ดซ้ำ
    if (swappable) {
      const [a, b] = swappable as [number, number];
      const dup = slots.map((s, i) => (i === b ? { ...s, cardId: (slots[a] as { cardId: string }).cardId } : s));
      check(!flower.validate(p, { slots: dup }).ok, `flower ${seed}: same card used twice accepted`);
      reuseTests++;
    }
    // สลับการ์ดระหว่างสองช่องที่ปัจจัยเดียวกันแต่ต้องการระดับต่างกัน ต้องไม่ผ่าน (แยกทดสอบการตรวจระดับ)
    outer1: for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) {
      const sa = slots[a] as FlowerAnswer['slots'][number], sb = slots[b] as FlowerAnswer['slots'][number];
      if (sa.factorId === sb.factorId && p.needs[`${sa.plot}:${sa.factorId}`] !== p.needs[`${sb.plot}:${sb.factorId}`]) {
        const sw = slots.map((s, i) => (i === a ? { ...s, cardId: sb.cardId } : i === b ? { ...s, cardId: sa.cardId } : s));
        check(!flower.validate(p, { slots: sw }).ok, `flower ${seed}: swapped wrong-level cards accepted`);
        wrongLevelTests++;
        break outer1;
      }
    }
    // สลับการ์ดระหว่างสองช่องที่ต่างปัจจัย ต้องไม่ผ่าน (แยกทดสอบการตรวจปัจจัย)
    {
      const sa = slots[0] as FlowerAnswer['slots'][number];
      const sb = slots.find((s) => s.factorId !== sa.factorId) as FlowerAnswer['slots'][number];
      const sw = slots.map((s) => (s === sa ? { ...s, cardId: sb.cardId } : s === sb ? { ...s, cardId: sa.cardId } : s));
      check(!flower.validate(p, { slots: sw }).ok, `flower ${seed}: swapped wrong-factor cards accepted`);
    }
    // ช่องไม่ครบ ต้องไม่ผ่าน
    check(!flower.validate(p, { slots: slots.slice(1) }).ok, `flower ${seed}: incomplete accepted`);
    // การ์ดผิดระดับ: หาการ์ดปัจจัยเดียวกันแต่ระดับตรงข้าม (ถ้ามี)
    const target = slots[k] as FlowerAnswer['slots'][number];
    const other = p.cards.find((c) => c.factorId === target.factorId && c.level !== p.needs[`${target.plot}:${target.factorId}`] && !used.has(c.id)) ?? p.cards.find((c) => c.factorId === target.factorId && c.level !== p.needs[`${target.plot}:${target.factorId}`]);
    if (other) {
      const mut = slots.map((s, i) => (i === k ? { ...s, cardId: other.id } : s));
      check(!flower.validate(p, { slots: mut }).ok, `flower ${seed}: wrong-level accepted`);
    }
    // คำใบ้ขั้น 3 วนซ้ำ: ใส่การ์ดที่ถูกตามป้ายระดับจนผ่าน
    let cur: FlowerAnswer['slots'] = [];
    for (let step = 0; step < 10 && !flower.validate(p, { slots: cur }).ok; step++) {
      const h3 = flower.hint(p, { slots: cur }, 3);
      if (!h3.slot || !h3.levelLabel) break;
      const f = FLOWER_CONTENT.factors.find((x) => x.id === (h3.slot as { factorId: string }).factorId);
      const lv = f?.levels[f.levelLabels.indexOf(h3.levelLabel)];
      const usedNow = new Set(cur.map((s) => s.cardId));
      const card = p.cards.find((c) => !usedNow.has(c.id) && c.factorId === h3.slot?.factorId && c.level === lv);
      if (!card) break;
      cur = cur.filter((s) => !(s.plot === h3.slot?.plot && s.factorId === h3.slot?.factorId)).concat([{ plot: h3.slot.plot, factorId: h3.slot.factorId, cardId: card.id }]);
    }
    check(flower.validate(p, { slots: cur }).ok, `flower ${seed}: tier-3 hints did not converge`);
  }
  check(reuseTests > N / 4, 'flower: card-reuse test rarely exercised');
  check(wrongLevelTests > N / 2, 'flower: wrong-level swap test rarely exercised');
  console.log(`flower    ผังไม่ซ้ำ (ชุดพืชและลำดับ) ${fps.size}/${N} | ทดสอบสลับการ์ดผิดระดับ ${wrongLevelTests} ผัง`);
}

/* ===================== BRIDGE ===================== */
function testBridge(): void {
  let dupZero = 0;
  const solCounts: number[] = [];
  const fps = new Set<string>();
  const rng = makeRng(999);
  for (let seed = 1; seed <= N; seed++) {
    const p: BridgePuzzle = timed('bridge', () => bridge.generate(seed));
    check(JSON.stringify(bridge.generate(seed)) === JSON.stringify(p), `bridge ${seed}: not deterministic`);
    noLeak('bridge', bridge.publicView(p));
    fps.add(bridge.fingerprint(p));
    solCounts.push(p.solutions.length);
    check(p.solutions.length >= p.params.minSolutions && p.solutions.length <= p.params.maxSolutions, `bridge ${seed}: solution count out of range`);
    for (const s of p.solutions) check(bridge.validate(p, { placements: s }).ok, `bridge ${seed}: stored solution rejected`);
    // อ็อราเคิลอิสระ: ตัวตรวจต้องตอบเหมือนการคำนวณโมเมนต์ตรง ๆ บนคำตอบสุ่ม
    const free: number[] = [];
    for (let q = -p.params.maxPos; q <= p.params.maxPos; q++) if (q !== 0 && q !== p.fixed.pos) free.push(q);
    for (let k = 0; k < 20; k++) {
      const poss = rng.shuffle(free).slice(0, p.weights.length);
      const ans: BridgeAnswer = { placements: p.weights.map((w, i) => ({ weightId: w.id, pos: poss[i] as number })) };
      const t = p.fixed.value * p.fixed.pos + ans.placements.reduce((s, x, i) => s + (p.weights[i] as { value: number }).value * x.pos, 0);
      check(bridge.validate(p, ans).ok === (t === 0), `bridge ${seed}: validator != torque oracle`);
    }
    // คำตอบสุ่มแบบอนุญาตตำแหน่งซ้ำ/ศูนย์/ทับก้อนที่ล็อก/นอกคาน: ผ่านก็ต่อเมื่อกติกาครบและโมเมนต์เป็นศูนย์
    for (let k = 0; k < 60; k++) {
      const poss = p.weights.map(() => rng.int(-p.params.maxPos - 1, p.params.maxPos + 1));
      const ans: BridgeAnswer = { placements: p.weights.map((w, i) => ({ weightId: w.id, pos: poss[i] as number })) };
      const t = p.fixed.value * p.fixed.pos + poss.reduce((sum, x, i) => sum + (p.weights[i] as { value: number }).value * x, 0);
      const legalPos = poss.every((x) => x !== 0 && Math.abs(x) <= p.params.maxPos && x !== p.fixed.pos) && new Set(poss).size === poss.length;
      const expected = legalPos && t === 0;
      if (t === 0 && !legalPos) dupZero++;
      check(bridge.validate(p, ans).ok === expected, `bridge ${seed}: validator != oracle on rule-breaking answer`);
    }
    // ผิดกติกา: ตำแหน่งชนกัน/ตำแหน่ง 0/ทับก้อนที่ล็อก/นอกคาน/ไม่ครบ/ซ้ำก้อน ต้องไม่ผ่าน
    const s0 = p.solutions[0] as BridgeAnswer['placements'];
    const bads: BridgeAnswer[] = [
      { placements: s0.map((x, i) => (i === 1 ? { ...x, pos: (s0[0] as { pos: number }).pos } : x)) },
      { placements: s0.map((x, i) => (i === 0 ? { ...x, pos: 0 } : x)) },
      { placements: s0.map((x, i) => (i === 0 ? { ...x, pos: p.fixed.pos } : x)) },
      { placements: s0.map((x, i) => (i === 0 ? { ...x, pos: p.params.maxPos + 1 } : x)) },
      { placements: s0.slice(1) },
      { placements: s0.map((x, i) => (i === 1 ? { ...x, weightId: (s0[0] as { weightId: string }).weightId } : x)) },
      { placements: s0.map((x, i) => (i === 0 ? { ...x, pos: 1.5 } : x)) },
    ];
    bads.forEach((b, i) => check(!bridge.validate(p, b).ok, `bridge ${seed}: invalid answer #${i} accepted`));
    // ขั้น 3 วนซ้ำต้องไปถึงคำตอบที่สมดุล
    let cur: BridgeAnswer['placements'] = [];
    for (let step = 0; step < p.weights.length + 2 && !bridge.validate(p, { placements: cur }).ok; step++) {
      const h3 = bridge.hint(p, { placements: cur }, 3);
      if (!h3.placement) break;
      const vals = new Map(p.weights.map((w) => [w.id, w.value]));
      // ใส่ก้อนที่ค่าตรงกัน และยังไม่ได้วางถูกตำแหน่ง
      const candidate = p.weights.find((w) => w.value === vals.get((h3.placement as { weightId: string }).weightId) && !cur.some((c) => c.weightId === w.id && c.pos === (h3.placement as { pos: number }).pos));
      const unplaced = p.weights.find((w) => w.value === candidate?.value && !cur.some((c) => c.weightId === w.id)) ?? candidate;
      if (!unplaced) break;
      cur = cur.filter((c) => c.weightId !== unplaced.id && c.pos !== (h3.placement as { pos: number }).pos).concat([{ weightId: unplaced.id, pos: h3.placement.pos }]);
    }
    check(bridge.validate(p, { placements: cur }).ok, `bridge ${seed}: tier-3 hints did not converge`);
    const h2 = bridge.hint(p, { placements: bads[0]?.placements ?? [] }, 2);
    check(h2.heavier === 'incomplete' || h2.heavier !== undefined, `bridge ${seed}: tier-2 empty`);
  }
  check(dupZero > 0, 'bridge: no zero-torque rule-breaking answer was ever tested');
  console.log(`bridge    คำตอบโมเมนต์ศูนย์แต่ผิดกติกาที่ทดสอบ ${dupZero} ครั้ง`);
  console.log(`bridge    ผังไม่ซ้ำ ${fps.size}/${N} | จำนวนคำตอบต่อผัง ${hist(solCounts)}`);
}

/* ===================== OBSERVATORY ===================== */
/** อ็อราเคิลอิสระของหอดูดาว: นับลำดับที่เป็นไปได้ทั้งหมดจากดาวที่ล็อกและเบาะแสชุดที่กำหนด */
function observatoryCount(p: ObservatoryPuzzle, clues: ObservatoryPuzzle['clues']): number {
  let ok = 0;
  const rec = (arr: string[], pre: string[]): void => {
    if (!arr.length) {
      if (!p.fixed.every((f) => pre[f.slot] === f.planetId)) return;
      const at = (id: string): number => pre.indexOf(id);
      for (const c of clues) {
        if (c.kind === 'pos' && at(c.a.planetId) !== c.slot) return;
        if (c.kind === 'before' && !(at(c.a.planetId) < at(c.b.planetId))) return;
        if (c.kind === 'next' && at(c.a.planetId) + 1 !== at(c.b.planetId)) return;
      }
      ok++;
      return;
    }
    arr.forEach((x, i) => rec([...arr.slice(0, i), ...arr.slice(i + 1)], [...pre, x]));
  };
  rec(p.solution, []);
  return ok;
}

function testObservatory(): void {
  const clueCounts: number[] = [];
  const attrCounts: number[] = [];
  const fps = new Set<string>();
  const rng = makeRng(1234);
  const M = Math.min(N, 1500); // หอดูดาวตรวจครบ 720 ลำดับต่อผัง จึงใช้จำนวนน้อยลงเพื่อเวลา
  for (let seed = 1; seed <= M; seed++) {
    const p: ObservatoryPuzzle = timed('observatory', () => observatory.generate(seed));
    check(JSON.stringify(observatory.generate(seed)) === JSON.stringify(p), `observatory ${seed}: not deterministic`);
    noLeak('observatory', observatory.publicView(p));
    fps.add(observatory.fingerprint(p));
    clueCounts.push(p.clues.length);
    attrCounts.push(p.clues.filter((c) => c.a.kind !== 'name' || (c.kind !== 'pos' && c.b.kind !== 'name')).length);
    check(observatory.validate(p, { order: p.solution }).ok, `observatory ${seed}: solution rejected`);
    // ลำดับของดาว 6 ดวงต้องเรียงตามลำดับจริงในระบบสุริยะ
    const idxs = p.solution.map((id) => PLANETS.findIndex((x) => x.id === id));
    check(idxs.every((v, i) => i === 0 || (idxs[i - 1] as number) < v), `observatory ${seed}: solution not in real order`);
    // อ็อราเคิลอิสระ: นับทุกลำดับ (720) ที่ตรงดาวที่วางไว้และเบาะแสทุกข้อ ต้องเหลือพอดี 1 (= เฉลย)
    const ids = p.solution;
    let ok = 0;
    const perm = (arr: string[], pre: string[] = []): void => {
      if (!arr.length) {
        if (!p.fixed.every((f) => pre[f.slot] === f.planetId)) return;
        const at = (id: string): number => pre.indexOf(id);
        for (const c of p.clues) {
          if (c.kind === 'pos' && at(c.a.planetId) !== c.slot) return;
          if (c.kind === 'before' && !(at(c.a.planetId) < at(c.b.planetId))) return;
          if (c.kind === 'next' && at(c.a.planetId) + 1 !== at(c.b.planetId)) return;
        }
        ok++;
        check(pre.join() === ids.join(), `observatory ${seed}: unique solution != real order`);
        return;
      }
      arr.forEach((x, i) => perm([...arr.slice(0, i), ...arr.slice(i + 1)], [...pre, x]));
    };
    perm(ids);
    check(ok === 1, `observatory ${seed}: solutions found by oracle = ${ok}`);
    // ทุกเบาะแสต้องจำเป็น: ตัดข้อใดออกแล้วต้องเหลือมากกว่า 1 คำตอบ
    p.clues.forEach((_, i) => check(observatoryCount(p, p.clues.filter((__, j) => j !== i)) > 1, `observatory ${seed}: clue ${i + 1} is redundant`));
    // ผิดกติกา
    const swap = (a: number, b: number): ObservatoryAnswer => { const o = p.solution.slice(); [o[a], o[b]] = [o[b] as string, o[a] as string]; return { order: o }; };
    const nonFixed = [0, 1, 2, 3, 4, 5].filter((i) => !p.fixed.some((f) => f.slot === i));
    const a = nonFixed[0] as number, b = nonFixed[1] as number;
    // ย้ายดาวที่ล็อกไว้ (สลับกับดาวอื่น) ต้องไม่ผ่านและรายงานช่องที่ล็อก
    {
      const fx = p.fixed[0] as { slot: number };
      const other = nonFixed[0] as number;
      const mv = observatory.validate(p, swap(fx.slot, other));
      check(!mv.ok && mv.reason === 'moved-fixed' && mv.wrong.includes(`slot:${fx.slot}`), `observatory ${seed}: moved fixed planet not reported`);
    }
    const sv = observatory.validate(p, swap(a, b));
    check(!sv.ok && sv.wrong.length === 2, `observatory ${seed}: swap not flagged exactly`);
    check(!observatory.validate(p, { order: p.solution.slice(0, 5) }).ok, `observatory ${seed}: short answer accepted`);
    const dupRes = observatory.validate(p, { order: [...p.solution.slice(0, 5), p.solution[0] as string] });
    check(!dupRes.ok && dupRes.reason === 'invalid-or-duplicate' && dupRes.wrong.includes('slot:5'), `observatory ${seed}: duplicate not reported`);
    check(!observatory.validate(p, { order: [...p.solution.slice(0, 5), 'pluto'] }).ok, `observatory ${seed}: unknown planet accepted`);
    // คำตอบสุ่ม: ผ่านก็ต่อเมื่อเท่าเฉลย
    for (let k = 0; k < 10; k++) {
      const o = rng.shuffle(p.solution);
      check(observatory.validate(p, { order: o }).ok === (o.join() === p.solution.join()), `observatory ${seed}: random answer mismatch`);
    }
    // ขั้น 3 วนซ้ำต้องไปถึงคำตอบ
    let cur = p.solution.map((id, i) => (p.fixed.some((f) => f.slot === i) ? id : '')) as string[];
    for (let step = 0; step < 8 && !observatory.validate(p, { order: cur }).ok; step++) {
      const h3 = observatory.hint(p, { order: cur }, 3);
      if (h3.slot == null || !h3.planetId) break;
      cur = cur.map((x, i) => (i === h3.slot ? (h3.planetId as string) : x === h3.planetId ? '' : x));
    }
    check(observatory.validate(p, { order: cur }).ok, `observatory ${seed}: tier-3 hints did not converge`);
  }
  console.log(`observatory ผังไม่ซ้ำ ${fps.size}/${M} | จำนวนเบาะแส ${hist(clueCounts)} | เบาะแสที่อ้างด้วยลักษณะ ${hist(attrCounts)}`);
}

/* ===================== เลี่ยงผังซ้ำ + พารามิเตอร์ + ความเร็ว ===================== */
function testMisc(): void {
  for (const [name, mod] of [['pond', pond], ['flower', flower], ['bridge', bridge], ['observatory', observatory]] as const) {
    let last: string | null = null;
    let repeats = 0;
    for (let i = 0; i < 200; i++) {
      const { puzzle } = generateNext(mod as never, 1000 + i, last) as { puzzle: never };
      const fp = (mod as { fingerprint: (p: never) => string }).fingerprint(puzzle);
      if (fp === last) repeats++;
      last = fp;
    }
    check(repeats === 0, `${name}: generateNext repeated the previous fingerprint ${repeats} times`);
  }
  // พารามิเตอร์ที่แก้ได้ต้องใช้ได้จริง
  const bigPond = createPondPuzzle({ pathLenMin: 11, pathLenMax: 13, decoys: 3 });
  for (let s = 1; s <= 200; s++) { const p = bigPond.generate(s); check(bigPond.validate(p, { tiles: p.solution }).ok, `pond override ${s}`); }
  const f4 = createFlowerPuzzle({ plots: 4, distractors: 3 });
  for (let s = 1; s <= 200; s++) { const p: FlowerPuzzle = f4.generate(s); check(p.cards.length === 12 + 3 && p.plots.length === 4, `flower override ${s}`); }
  const b5 = createBridgePuzzle({ weightCount: 5, maxSolutions: 80, minSolutions: 2 });
  for (let s = 1; s <= 100; s++) { const p = b5.generate(s); check(p.solutions.every((x) => b5.validate(p, { placements: x }).ok), `bridge override ${s}`); }
  const o5 = createObservatoryPuzzle({ bodies: 5, fixedCount: 1, clueCount: 3, maxClues: 5 });
  for (let s = 1; s <= 100; s++) { const p = o5.generate(s); check(o5.validate(p, { order: p.solution }).ok && p.solution.length === 5, `observatory override ${s}`); }
}

const t0 = performance.now();
test('farm puzzles: generators, validators, hints, determinism', { timeout: 120_000 }, () => {
  testPondDirected();
  testPond();
  testFlower();
  testBridge();
  testObservatory();
  testMisc();
  console.log('\nเวลาสร้างผังต่อ 1 ผัง (มิลลิวินาที):');
  for (const [k, v] of Object.entries(timing)) {
    const sorted = v.slice().sort((a, b) => a - b);
    console.log(`  ${k.padEnd(12)} เฉลี่ย ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)} | p99 ${(sorted[Math.floor(sorted.length * 0.99)] as number).toFixed(3)} | สูงสุด ${(sorted[sorted.length - 1] as number).toFixed(3)}`);
  }
  console.log(`รวมเวลาทดสอบ ${((performance.now() - t0) / 1000).toFixed(1)} วินาที | N=${N}`);
  assert.equal(failures, 0, `ล้มเหลว ${failures} ข้อ:\n  - ${failed.join('\n  - ')}`);
});
