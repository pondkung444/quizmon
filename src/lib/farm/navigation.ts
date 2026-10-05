import type { FarmTile } from "./world";
import {farmBuildingBlocksCell} from "./buildings.ts";

export const CELLS_PER_TILE = 6;
export type FarmCell = { x: number; y: number };
export const cellKey = (cell: FarmCell) => `${cell.x},${cell.y}`;

export function farmWalkableCells(tiles: readonly FarmTile[]): Map<string, FarmCell> {
  const cells = new Map<string, FarmCell>();
  for (const tile of tiles) {
    for (let y = 0; y < CELLS_PER_TILE; y++) {
      for (let x = 0; x < CELLS_PER_TILE; x++) {
        // Keep the building footprint blocked; perimeter and front plaza remain connected.
        if (farmBuildingBlocksCell(tile.kind,x,y)) continue;
        const cell = { x: tile.x * CELLS_PER_TILE + x, y: tile.y * CELLS_PER_TILE + y };
        cells.set(cellKey(cell), cell);
      }
    }
  }
  return cells;
}

export function farmWalkingPath(cells: ReadonlyMap<string, FarmCell>, start: FarmCell, target: FarmCell, occupied: ReadonlySet<string> = new Set()): FarmCell[] {
  const startKey = cellKey(start), targetKey = cellKey(target);
  if (!cells.has(startKey) || !cells.has(targetKey) || occupied.has(targetKey)) return [];
  const queue = [start];
  const parents = new Map<string, string | null>([[startKey, null]]);
  let index = 0;
  while (index < queue.length) {
    const current = queue[index++];
    const currentKey = cellKey(current);
    if (currentKey === targetKey) {
      const path: FarmCell[] = [];
      let key: string | null = targetKey;
      while (key && key !== startKey) {
        path.push(cells.get(key)!);
        key = parents.get(key) ?? null;
      }
      return path.reverse();
    }
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = cellKey(next);
      if (!cells.has(key) || parents.has(key) || occupied.has(key)) continue;
      parents.set(key, currentKey);
      queue.push(next);
    }
  }
  return [];
}
