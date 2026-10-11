import type { FarmTile } from "./world.ts";
import { CELLS_PER_TILE, cellKey, type FarmCell } from "./navigation.ts";
export type FarmActivity =
  "bench" | "pond-rest" | "butterflies" | "bridge-cross" | "stargaze";
export const ACTIVITY_LABELS: Record<FarmActivity, string> = {
  bench: "พักที่ม้านั่ง",
  "pond-rest": "พักริมบ่อ",
  butterflies: "ชมผีเสื้อ",
  "bridge-cross": "เดินข้ามสะพาน",
  stargaze: "มองท้องฟ้า",
};
export function thaiHour(now: number) {
  return new Date(now + 7 * 3600000).getUTCHours();
}
export function activityTargets(
  tiles: readonly FarmTile[],
  cells: ReadonlyMap<string, FarmCell>,
  now: number,
  start?: FarmCell,
): { activity: FarmActivity; cell: FarmCell }[] {
  const result: { activity: FarmActivity; cell: FarmCell }[] = [];
  for (const tile of tiles) {
    const activity =
      tile.kind === "garden"
        ? "bench"
        : tile.kind === "pond"
          ? "pond-rest"
          : tile.kind === "flower"
            ? "butterflies"
            : tile.kind === "bridge"
              ? "bridge-cross"
              : tile.kind === "observatory" &&
                  (thaiHour(now) >= 18 || thaiHour(now) < 6)
                ? "stargaze"
                : null;
    if (!activity) continue;
    const local =
      tile.kind === "bridge"
        ? tile.orientation === 1
          ? [
              { x: 2, y: 0 },
              { x: 2, y: 5 },
            ]
          : [
              { x: 0, y: 2 },
              { x: 5, y: 2 },
            ]
        : [{ x: 4, y: 5 }];
    const preferred =
      tile.kind === "bridge" && start
        ? local.filter((offset) =>
            tile.orientation === 1
              ? offset.y === (start.y < tile.y * CELLS_PER_TILE + 3 ? 5 : 0)
              : offset.x === (start.x < tile.x * CELLS_PER_TILE + 3 ? 5 : 0),
          )
        : local;
    for (const offset of preferred) {
      const cell = {
        x: tile.x * CELLS_PER_TILE + offset.x,
        y: tile.y * CELLS_PER_TILE + offset.y,
      };
      if (cells.has(cellKey(cell))) result.push({ activity, cell });
    }
  }
  return result;
}
