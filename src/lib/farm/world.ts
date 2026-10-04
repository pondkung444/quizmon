export type FarmTile = {
  id: string;
  kind: "meadow" | "school" | "residence" | "eggs";
  x: number;
  y: number;
  level: number;
};

export const INITIAL_FARM: FarmTile[] = [
  { id: "home-meadow", kind: "meadow", x: 0, y: 0, level: 1 },
  { id: "qmon-residence", kind: "residence", x: 1, y: 0, level: 1 },
  { id: "egg-storage", kind: "eggs", x: 0, y: 1, level: 1 },
];
export const NEIGHBORS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
export const tileKey = (x: number, y: number) => `${x},${y}`;

export function availableFarmPlots(tiles: readonly FarmTile[]) {
  const occupied = new Set(tiles.map(tile => tileKey(tile.x, tile.y)));
  const plots = new Map<string, { x: number; y: number }>();
  for (const tile of tiles) {
    for (const offset of NEIGHBORS) {
      const x = tile.x + offset.x;
      const y = tile.y + offset.y;
      const key = tileKey(x, y);
      if (!occupied.has(key)) plots.set(key, { x, y });
    }
  }
  return [...plots.values()];
}

// The future construction system calls this only after a project is completed.
export function attachFarmTile(tiles: readonly FarmTile[], tile: FarmTile): FarmTile[] {
  if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) throw new Error("Farm coordinates must be integers");
  if (tiles.some(item => item.id === tile.id)) throw new Error("Farm tile ID already exists");
  if (!availableFarmPlots(tiles).some(plot => plot.x === tile.x && plot.y === tile.y)) {
    throw new Error("New farm area must connect to an empty neighboring plot");
  }
  if (tile.kind === "school" && tiles.some(item => item.kind === "school")) throw new Error("The main school is unique");
  return [...tiles, tile];
}

export function farmBounds(tiles: readonly FarmTile[]) {
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const tile of tiles) {
    minX = Math.min(minX, tile.x);
    minY = Math.min(minY, tile.y);
    maxX = Math.max(maxX, tile.x);
    maxY = Math.max(maxY, tile.y);
  }
  // One extra plot in every direction reserves a visible expansion frontier.
  return { minX: minX - 1, minY: minY - 1, columns: maxX - minX + 3, rows: maxY - minY + 3 };
}
