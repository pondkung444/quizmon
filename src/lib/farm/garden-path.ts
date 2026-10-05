export type GardenPlacement = {id:string;x:number;y:number;rotation:number};
export type GardenPoint = {x:number;y:number};
export const GARDEN_START:GardenPoint={x:0,y:3};
export const GARDEN_BENCH:GardenPoint={x:3,y:0};
export const GARDEN_BLOCKED=['0,0','0,1','1,0','2,3','3,3'];
export const GARDEN_PIECES=[{id:'straight-a',kind:'straight'},{id:'straight-b',kind:'straight'},{id:'bend-a',kind:'bend'},{id:'bend-b',kind:'bend'},{id:'bend-c',kind:'bend'}] as const;
// Clockwise ports: north, east, south, west. Each road has two connected ends.
export function gardenPorts(id:string,rotation:number):number[]{
 const piece=GARDEN_PIECES.find(p=>p.id===id);
 if(!piece)return [];
 return (piece.kind==='straight'?[0,2]:[0,1]).map(port=>(port+rotation)%4);
}
export type GardenPathResult={valid:boolean;message:string;path:GardenPoint[];stop:GardenPoint};
export function validateGardenPath(value:unknown):GardenPathResult{
 const path:GardenPoint[]=[GARDEN_START];
 const fail=(message:string,stop=path[path.length-1]):GardenPathResult=>({valid:false,message,path,stop});
 if(!Array.isArray(value)||value.length>GARDEN_PIECES.length)return fail('วางทางเดินจากถาดในสวนก่อน');
 const ids=new Set<string>(),cells=new Set<string>();
 const layout:GardenPlacement[]=[];
 for(const item of value){
  if(!item||typeof item!=='object')return fail('ข้อมูลทางเดินไม่ครบ ลองจัดใหม่');
  const p=item as GardenPlacement;
  if(!GARDEN_PIECES.some(piece=>piece.id===p.id)||![p.x,p.y,p.rotation].every(Number.isInteger)||p.x<0||p.x>3||p.y<0||p.y>3||p.rotation<0||p.rotation>3)return fail('ใช้ชิ้นทางเดินในถาดและวางภายในสวน');
  const key=p.x+','+p.y;
  if(ids.has(p.id)||cells.has(key)||GARDEN_BLOCKED.includes(key)||key==='0,3'||key==='3,0')return fail('ทางเดินต้องไม่ซ้อนกันหรือทับบ่อ ต้นไม้ และม้านั่ง');
  ids.add(p.id);cells.add(key);layout.push(p);
 }
 const vectors=[[0,-1],[1,0],[0,1],[-1,0]];
 let current=GARDEN_START,exit=1;
 const visited=new Set<string>();
 for(let step=0;step<17;step++){
  const [dx,dy]=vectors[exit],next={x:current.x+dx,y:current.y+dy},entry=(exit+2)%4;
  if(next.x===GARDEN_BENCH.x&&next.y===GARDEN_BENCH.y){
   if(entry!==2)return fail('ม้านั่งเข้าจากด้านล่าง ต่อทางให้ถึงหน้าม้านั่ง');
   path.push(next);
   if(layout.length!==GARDEN_PIECES.length||visited.size!==layout.length)return fail('ต่อทางให้ใช้ครบทั้ง 5 ชิ้นก่อนถึงม้านั่ง',next);
   return {valid:true,message:'ถึงม้านั่งแล้ว! คู่หูได้นั่งพักในสวนของเรา',path,stop:next};
  }
  const key=next.x+','+next.y;
  if(next.x<0||next.x>3||next.y<0||next.y>3)return fail('ทางเดินออกนอกสวน หมุนปลายทางกลับเข้ามา');
  if(GARDEN_BLOCKED.includes(key))return fail('ทางนี้ชนบ่อหรือต้นไม้ ลองต่อไปช่องหญ้าที่ว่าง');
  const piece=layout.find(p=>p.x===next.x&&p.y===next.y);
  if(!piece)return fail('ทางขาดตรงปลายที่สว่าง วางชิ้นต่อจากตรงนี้');
  const ports=gardenPorts(piece.id,piece.rotation);
  if(!ports.includes(entry))return fail('รอยต่อยังไม่ตรงกัน แตะชิ้นข้างปลายทางเพื่อหมุน');
  if(visited.has(key))return fail('ทางวนกลับมาที่เดิม ลองเปลี่ยนทางไปม้านั่ง');
  visited.add(key);path.push(next);current=next;exit=ports.find(port=>port!==entry)!;
 }
 return fail('ลองต่อทางใหม่ให้ไปถึงม้านั่ง');
}
