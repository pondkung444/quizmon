import { makeRng, type HintTier } from "./puzzles/core.ts";
import {
  FLOOR_PIECES,
  floorCells,
  validateFloor,
  type FloorPlacement,
} from "./floor-puzzle.ts";
import {
  GARDEN_PIECES,
  gardenPorts,
  validateGardenPath,
  type GardenPlacement,
  type GardenBoardConfig,
} from "./garden-path.ts";
export type ConstructionKind = "construction-floor" | "construction-path";
export type ConstructionPuzzle =
  | {
      kind: "construction-floor";
      version: 1;
      seed: number;
      fixed: FloorPlacement;
      solution: FloorPlacement[];
    }
  | {
      kind: "construction-path";
      version: 1;
      seed: number;
      board: GardenBoardConfig;
      solution: GardenPlacement[];
    };
export type ConstructionPublic =
  | { kind: "construction-floor"; version: 1; fixed: FloorPlacement }
  | { kind: "construction-path"; version: 1; board: GardenBoardConfig };
const vectors = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
function allFloors() {
  const result: FloorPlacement[][] = [];
  function visit(
    index: number,
    layout: FloorPlacement[],
    occupied: Set<string>,
  ) {
    if (index === 4) {
      result.push(layout);
      return;
    }
    const id = FLOOR_PIECES[index].id;
    for (const rotation of id === "sun" || id === "leaf" ? [0] : [0, 1])
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const cells = floorCells(id, rotation).map(([dx, dy]) => [
            x + dx,
            y + dy,
          ]);
          if (
            cells.some(
              ([cx, cy]) => cx > 3 || cy > 3 || occupied.has(cx + "," + cy),
            )
          )
            continue;
          visit(
            index + 1,
            [...layout, { id, x, y, rotation }],
            new Set([...occupied, ...cells.map(([cx, cy]) => cx + "," + cy)]),
          );
        }
  }
  visit(0, [], new Set());
  return result;
}
// Immutable geometry, shared between requests; contains no player state.
const FLOORS = allFloors();
function cells(p: FloorPlacement) {
  return floorCells(p.id, p.rotation)
    .map(([x, y]) => p.x + x + "," + (p.y + y))
    .sort()
    .join("|");
}
function same(a: FloorPlacement, b: FloorPlacement) {
  if (!FLOOR_PIECES.some((p) => p.id === a.id))
    return (
      a.id === b.id && a.x === b.x && a.y === b.y && a.rotation === b.rotation
    );
  return a.id === b.id && cells(a) === cells(b);
}
export function generateConstruction(
  kind: ConstructionKind,
  seed: number,
): ConstructionPuzzle {
  const rng = makeRng(seed);
  if (kind === "construction-floor") {
    const solution = rng.pick(FLOORS).map((x) => ({ ...x }));
    return {
      kind,
      version: 1,
      seed,
      fixed: { ...rng.pick(solution) },
      solution,
    };
  }
  const middle = rng.pick([
    [1, 0, 1, 0],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
    [0, 0, 1, 1],
  ]);
  const directions = [1, ...middle, 0],
    turn = rng.int(0, 3),
    mirror = rng.int(0, 1) === 1;
  const point = (x: number, y: number) => {
    for (let i = 0; i < turn; i++) [x, y] = [3 - y, x];
    return { x: mirror ? 3 - x : x, y };
  };
  const direction = (d: number) => {
    d = (d + turn) % 4;
    return mirror && d % 2 === 1 ? 4 - d : d;
  };
  let position = { x: 0, y: 3 };
  const route = [position];
  for (const d of directions) {
    position = { x: position.x + vectors[d][0], y: position.y + vectors[d][1] };
    route.push(position);
  }
  const remaining = GARDEN_PIECES.map((x) => ({ ...x }));
  const solution = route.slice(1, -1).map((p, i) => {
    const ports = [
      direction((directions[i] + 2) % 4),
      direction(directions[i + 1]),
    ].sort();
    const kind = (ports[0] + 2) % 4 === ports[1] ? "straight" : "bend";
    const index = remaining.findIndex((x) => x.kind === kind);
    const piece = remaining.splice(index, 1)[0];
    if (!piece) throw new Error("Invalid route inventory");
    const rotation = [0, 1, 2, 3].find(
      (r) => gardenPorts(piece.id, r).sort().join(",") === ports.join(","),
    )!;
    return { id: piece.id, ...point(p.x, p.y), rotation };
  });
  const occupied = new Set(
    route.map((p) => {
      const q = point(p.x, p.y);
      return q.x + "," + q.y;
    }),
  );
  const candidates = Array.from(
    { length: 16 },
    (_, i) => (i % 4) + "," + Math.floor(i / 4),
  ).filter((key) => !occupied.has(key));
  return {
    kind,
    version: 1,
    seed,
    solution,
    board: {
      start: point(0, 3),
      bench: point(3, 0),
      startExit: direction(1),
      benchEntry: direction(2),
      blocked: rng.shuffle(candidates).slice(0, 5),
    },
  };
}
export function publicConstruction(p: ConstructionPuzzle): ConstructionPublic {
  if (p.version !== 1) throw new Error("รุ่นพัซเซิลยังไม่รองรับ");
  return p.kind === "construction-floor"
    ? { kind: p.kind, version: 1, fixed: { ...p.fixed } }
    : {
        kind: p.kind,
        version: 1,
        board: { ...p.board, blocked: [...p.board.blocked] },
      };
}
export function constructionAnswer(
  p: Pick<ConstructionPuzzle, "kind">,
  value: unknown,
): FloorPlacement[] | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 8192
  )
    return null;
  const layout = (value as { layout?: unknown }).layout;
  if (
    !Array.isArray(layout) ||
    layout.length > (p.kind === "construction-floor" ? 4 : 5)
  )
    return null;
  const ids = p.kind === "construction-floor" ? FLOOR_PIECES : GARDEN_PIECES;
  if (
    layout.some(
      (x) =>
        !x ||
        typeof x !== "object" ||
        !ids.some((piece) => piece.id === x.id) ||
        ![x.x, x.y, x.rotation].every(Number.isInteger) ||
        x.x < 0 ||
        x.x > 3 ||
        x.y < 0 ||
        x.y > 3 ||
        x.rotation < 0 ||
        x.rotation > 3,
    )
  )
    return null;
  return layout as FloorPlacement[];
}
export function validateConstruction(p: ConstructionPuzzle, value: unknown) {
  const layout = constructionAnswer(p, value);
  if (!layout || p.version !== 1)
    return {
      ok: false,
      wrong: [],
      reason: "malformed",
      message: "ข้อมูลชิ้นพัซเซิลไม่ถูกต้อง",
    };
  if (p.kind === "construction-path") {
    const r = validateGardenPath(layout, p.board);
    return {
      ok: r.valid,
      wrong: r.valid ? [] : ["route"],
      message: r.message,
      path: r.path,
    };
  }
  const fixed = layout.find((x) => x.id === p.fixed.id);
  if (!fixed || !same(fixed, p.fixed))
    return {
      ok: false,
      wrong: [p.fixed.id],
      message: "เก็บแผ่นที่วางไว้แล้วในตำแหน่งเดิม",
    };
  const r = validateFloor(layout);
  return { ok: r.valid, wrong: r.valid ? [] : ["floor"], message: r.message };
}
export function hintConstruction(
  p: ConstructionPuzzle,
  value: unknown,
  tier: HintTier,
): string {
  if (p.version !== 1) throw new Error("รุ่นพัซเซิลยังไม่รองรับ");
  const layout = constructionAnswer(p, value) ?? [];
  if (tier === 1)
    return p.kind === "construction-floor"
      ? "เริ่มจากแผ่นที่วางไว้แล้ว วางแผ่นยาวตามขอบ ไม่ให้ชิ้นซ้อนกัน"
      : "เริ่มตามลูกศรของคู่หู หมุนทางให้ต่อกันจนถึงทางเข้าม้านั่ง";
  if (tier === 2)
    return p.kind === "construction-floor"
      ? "ดูช่องว่างที่แผ่นยาววางได้เต็มแถวหรือเต็มแนว"
      : "ดูทางต่อจากช่องเริ่ม และตรวจว่าทางที่วางเปิดเข้าหากัน";
  let solution = p.solution;
  if (p.kind === "construction-floor")
    solution = FLOORS.filter((s) => s.some((x) => same(x, p.fixed))).sort(
      (a, b) =>
        b.filter((x) => layout.some((y) => same(x, y))).length -
        a.filter((x) => layout.some((y) => same(x, y))).length,
    )[0];
  const next = solution.find((x) => !layout.some((y) => same(x, y)));
  return next
    ? `ลองชิ้น ${FLOOR_PIECES.find((piece) => piece.id === next.id)?.name ?? (next.id.startsWith("straight") ? "ทางตรง" : "ทางโค้ง")} ที่แถว ${next.y + 1} ช่อง ${next.x + 1} หมุน ${next.rotation * 90}°`
    : "ผังนี้พร้อมแล้ว ลองกดตรวจงานได้เลย";
}
