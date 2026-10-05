export * from './core.ts';
export * from './content.ts';
export { createPondPuzzle, pond, type PondPuzzle, type PondPublic, type PondAnswer, type PondHint, type Tile, type PondParams } from './pond.ts';
export { createFlowerPuzzle, flower, type FlowerPuzzle, type FlowerPublic, type FlowerAnswer, type FlowerHint, type FlowerParams } from './flower.ts';
export { createBridgePuzzle, bridge, type BridgePuzzle, type BridgePublic, type BridgeAnswer, type BridgeHint, type BridgeParams, type Placement } from './bridge.ts';
export { createObservatoryPuzzle, observatory, type ObservatoryPuzzle, type ObservatoryPublic, type ObservatoryAnswer, type ObservatoryHint, type ObservatoryParams } from './observatory.ts';

import { pond } from './pond.ts';
import { flower } from './flower.ts';
import { bridge } from './bridge.ts';
import { observatory } from './observatory.ts';

/** ตารางสถานที่ -> พัซเซิล ใช้ตอนเซิร์ฟเวอร์สร้างผังให้จุดช่วยของโครงการนั้น */
export const PUZZLE_BY_PLACE = { pond, flower, bridge, observatory } as const;
export type PlacePuzzleKind = keyof typeof PUZZLE_BY_PLACE;
