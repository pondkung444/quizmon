export type FarmPlace = 'school' | 'garden' | 'pond' | 'flower' | 'bridge' | 'observatory';
export type ProjectDefinition = {
  id: string; place: FarmPlace; schoolLevel: number; targetLevel: number | null;
  blueprint: string | null; prerequisite: Partial<Record<FarmPlace, number>>;
  price: number; firstReward: number; limit: number; leaderStage: number;
  waits: readonly number[]; puzzleSeconds: number; contentVersion: number;
};
const hours = (...values: number[]) => values.map(n => n * 3600);
export const FARM_AREA_CAP = 24;
export const SCHOOL_CAPACITY = [{jobs:0,helpers:0},{jobs:1,helpers:0},{jobs:2,helpers:1},{jobs:2,helpers:2},{jobs:3,helpers:3}] as const;
export const FARM_CATALOGUE: readonly ProjectDefinition[] = [
  {id:'garden',place:'garden',schoolLevel:1,targetLevel:null,blueprint:'garden-rest-v1',prerequisite:{},price:40,firstReward:20,limit:4,leaderStage:2,waits:[300,300],puzzleSeconds:180,contentVersion:1},
  {id:'school-2',place:'school',schoolLevel:1,targetLevel:2,blueprint:null,prerequisite:{garden:1},price:40,firstReward:30,limit:1,leaderStage:2,waits:hours(6,8,8),puzzleSeconds:180,contentVersion:1},
  {id:'pond',place:'pond',schoolLevel:2,targetLevel:null,blueprint:'pond-cycle-v1',prerequisite:{},price:50,firstReward:20,limit:3,leaderStage:2,waits:hours(8,8,8),puzzleSeconds:180,contentVersion:1},
  {id:'flower',place:'flower',schoolLevel:2,targetLevel:null,blueprint:'flower-photosynthesis-v1',prerequisite:{},price:50,firstReward:20,limit:3,leaderStage:3,waits:hours(8,8,8),puzzleSeconds:240,contentVersion:1},
  {id:'school-3',place:'school',schoolLevel:2,targetLevel:3,blueprint:null,prerequisite:{pond:1},price:100,firstReward:40,limit:1,leaderStage:3,waits:hours(12,12,12,12),puzzleSeconds:240,contentVersion:1},
  {id:'bridge',place:'bridge',schoolLevel:3,targetLevel:null,blueprint:'bridge-balance-v1',prerequisite:{},price:90,firstReward:30,limit:2,leaderStage:3,waits:hours(12,12,12,12),puzzleSeconds:240,contentVersion:1},
  {id:'school-4',place:'school',schoolLevel:3,targetLevel:4,blueprint:null,prerequisite:{flower:1,bridge:1},price:160,firstReward:60,limit:1,leaderStage:4,waits:hours(16,16,16,16,16),puzzleSeconds:300,contentVersion:1},
  {id:'observatory',place:'observatory',schoolLevel:4,targetLevel:null,blueprint:'observatory-orbits-v1',prerequisite:{},price:150,firstReward:40,limit:1,leaderStage:4,waits:hours(18,18,18,18,18),puzzleSeconds:300,contentVersion:1},
];
export function remainingWait(seconds: number, oldHelpers: number, newHelpers: number) {
  if (![seconds,oldHelpers,newHelpers].every(Number.isFinite) || seconds<0 ||
      ![oldHelpers,newHelpers].every(n=>Number.isInteger(n)&&n>=0&&n<=3)) throw new Error('Invalid team timing');
  return Math.ceil(seconds * (10-newHelpers)/(10-oldHelpers));
}
