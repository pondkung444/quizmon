import { NEIGHBORS, tileKey, type FarmTile } from "./world.ts";
export type BridgeOrientation = 0 | 1;
export function tilePorts(tile: FarmTile): number[] {
  return tile.kind === "bridge"
    ? tile.orientation === 1
      ? [0, 2]
      : [1, 3]
    : [0, 1, 2, 3];
}
export function connectedTiles(a: FarmTile, b: FarmTile) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const side = NEIGHBORS.findIndex((p) => p.x === dx && p.y === dy);
  return (
    side >= 0 &&
    tilePorts(a).includes(side) &&
    tilePorts(b).includes((side + 2) % 4)
  );
}
export function validateFarmLayout(tiles: readonly FarmTile[]): {
  valid: boolean;
  message: string;
} {
  if (tiles.length < 3 || tiles.length > 24)
    return { valid: false, message: "พื้นที่ฟาร์มต้องไม่เกิน 24 ชิ้น" };
  const ids = new Set<string>(),
    positions = new Set<string>();
  for (const tile of tiles) {
    if (
      !Number.isInteger(tile.x) ||
      !Number.isInteger(tile.y) ||
      Math.abs(tile.x) > 10000 ||
      Math.abs(tile.y) > 10000 ||
      !Number.isInteger(tile.orientation ?? 0) ||
      ![0, 1].includes(tile.orientation ?? 0)
    )
      return { valid: false, message: "ตำแหน่งหรือทิศไม่ถูกต้อง" };
    if (ids.has(tile.id) || positions.has(tileKey(tile.x, tile.y)))
      return { valid: false, message: "ชิ้นพื้นที่ต้องไม่ซ้อนกัน" };
    ids.add(tile.id);
    positions.add(tileKey(tile.x, tile.y));
  }
  for (const [id, kind] of [
    ["home-meadow", "meadow"],
    ["qmon-residence", "residence"],
    ["egg-storage", "eggs"],
  ] as const)
    if (!tiles.some((t) => t.id === id && t.kind === kind))
      return { valid: false, message: "ต้องมีชิ้นฐานของฟาร์มครบ" };
  for (const [kind, limit] of [
    ["meadow", 1],
    ["residence", 1],
    ["eggs", 1],
    ["school", 1],
    ["garden", 4],
    ["pond", 3],
    ["flower", 3],
    ["bridge", 2],
    ["observatory", 1],
  ] as const)
    if (tiles.filter((t) => t.kind === kind).length > limit)
      return { valid: false, message: "จำนวนสถานที่ชนิดนี้เต็มแล้ว" };
  const visited = new Set([tiles[0].id]),
    queue = [tiles[0]];
  for (let i = 0; i < queue.length; i++)
    for (const next of tiles)
      if (!visited.has(next.id) && connectedTiles(queue[i], next)) {
        visited.add(next.id);
        queue.push(next);
      }
  return visited.size === tiles.length
    ? { valid: true, message: "ผังเชื่อมถึงกันแล้ว" }
    : {
        valid: false,
        message: "ทุกพื้นที่ต้องเชื่อมถึงกันตามทางเข้าออกของสะพาน",
      };
}
export function previewFarmMove(
  tiles: readonly FarmTile[],
  id: string,
  x: number,
  y: number,
  orientation?: BridgeOrientation,
) {
  if (!tiles.some((t) => t.id === id)) throw Error("เลือกชิ้นในฟาร์มของเรา");
  const next = tiles.map((t) =>
    t.id === id ? { ...t, x, y, orientation: orientation ?? t.orientation } : t,
  );
  const result = validateFarmLayout(next);
  return { ...result, tiles: next };
}
export function bridgeWalkable(
  x: number,
  y: number,
  orientation: BridgeOrientation,
) {
  return orientation === 1 ? x === 2 || x === 3 : y === 2 || y === 3;
}
