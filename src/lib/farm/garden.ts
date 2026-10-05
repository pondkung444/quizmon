
import type {SchoolProject} from './school';
import type {FarmTile} from './world';
import type {GardenPlacement} from './garden-path';
export type GardenProject=SchoolProject & {id:string;builder_id:string|null;price:number;finish_seconds:number;round_seconds:number;penalty_seconds:number;layout:GardenPlacement[]|null;completed_at:string|null};
export type FarmRules={daily_coins:number;milestone_coins:number;garden_price:number;work_seconds:number;finish_seconds:number;round_seconds:number;penalty_seconds:number};
export type FarmWallet={balance:number;rules:FarmRules};
export type GardenResult={project?:GardenProject;serverNow?:string;message?:string;passed?:boolean;error?:string};
export function gardenTiles(projects:readonly GardenProject[]):FarmTile[]{return projects.filter(p=>p.status==='placed'&&p.tile_x!==null&&p.tile_y!==null).map(p=>({id:p.id,kind:'garden',level:1,x:p.tile_x!,y:p.tile_y!}));}
