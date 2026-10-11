import type {FarmTile} from './world';
// The display and routing share the same compact building specification.
export function farmBuildingLayout(kind:FarmTile['kind']){
 return {widthRatio:kind==='bridge'?.9:kind==='garden'?.35:.44,anchor:kind==='bridge'?.5:.67,blockedMin:2,blockedMax:3};
}
export function farmBuildingBlocksCell(kind:FarmTile['kind'],x:number,y:number){
 if(kind==='meadow')return false;
 const {blockedMin,blockedMax}=farmBuildingLayout(kind);
 return x>=blockedMin&&x<=blockedMax&&y>=blockedMin&&y<=blockedMax;
}
