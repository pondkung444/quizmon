import { availableFarmPlots, type FarmTile } from "./world.ts";

export function farmGeometry(tiles: readonly FarmTile[], tileWidth: number) {
  const points = [...tiles, ...availableFarmPlots(tiles)];
  const left = Math.min(...points.map(p => (p.x - p.y) * tileWidth / 2 - tileWidth / 2), 0);
  const right = Math.max(...points.map(p => (p.x - p.y) * tileWidth / 2 + tileWidth / 2), tileWidth);
  const top = Math.min(...points.map(p => (p.x + p.y) * tileWidth / 4), 0);
  const bottom = Math.max(...points.map(p => (p.x + p.y) * tileWidth / 4 + tileWidth), tileWidth);
  // Fixed camera padding lets a small overview remain centered instead of clamping against scroll origin.
  return { originX: -left + tileWidth * .2 + 300, originY: -top + tileWidth * .25 + 260, width: right - left + tileWidth * .4 + 600, height: bottom - top + tileWidth * .5 + 520, tileWidth };
}

export function projectFarmPoint(x: number, y: number, geometry: ReturnType<typeof farmGeometry>) {
  return { x: geometry.originX + (x - y) * geometry.tileWidth / 2, y: geometry.originY + (x + y) * geometry.tileWidth / 4 };
}

export function occupiedFarmRectangle(tiles: readonly FarmTile[], tileWidth: number) {
  const geometry = farmGeometry(tiles, tileWidth);
  const corners = tiles.flatMap(tile => [projectFarmPoint(tile.x, tile.y, geometry), projectFarmPoint(tile.x + 1, tile.y, geometry), projectFarmPoint(tile.x, tile.y + 1, geometry), projectFarmPoint(tile.x + 1, tile.y + 1, geometry)]);
  const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
  const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
  return { x: minX, y: minY - tileWidth * .22, width: maxX - minX, height: maxY - minY + tileWidth * .6 };
}
