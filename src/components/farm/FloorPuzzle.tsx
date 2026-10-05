"use client";
import { useEffect,useRef,useState,type PointerEvent,type ReactNode } from "react";
import { FLOOR_PIECES,floorCells,validateFloor,type FloorPlacement } from "@/lib/farm/floor-puzzle";
import styles from "./school.module.css";
const names:Record<string,string>={sun:"ดอกทอง",leaf:"ใบไม้",water:"สายน้ำ",stone:"อเมทิสต์"};
const filters:Record<string,string>={sun:"none",leaf:"hue-rotate(55deg)",water:"hue-rotate(150deg)",stone:"hue-rotate(235deg)"};
export default function FloorPuzzle({busy,practice,onSubmit,screenHeader,screenHidden=false,feedback}:{busy:boolean;practice:boolean;screenHeader?:ReactNode;screenHidden?:boolean;feedback?:string;onSubmit:(layout:FloorPlacement[])=>void}) {
 const [layout,setLayout]=useState<FloorPlacement[]>([]);
 const [selected,setSelected]=useState("sun");
 const [rotation,setRotation]=useState(0);
 const [hint,setHint]=useState("");
 const [ghost,setGhost]=useState<FloorPlacement|null>(null);
 const board=useRef<HTMLDivElement>(null);
 const isScreen=!!screenHeader&&!screenHidden;
 useEffect(()=>{if(!isScreen)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;};},[isScreen]);
 const gesture=useRef<{id:string;r:number;sx:number;sy:number;dx:number;dy:number;moved:boolean}|null>(null);
 const suppress=useRef(false);
 const tap=useRef<{id:string;rotate:boolean}|null>(null);
 function place(x:number,y:number,id=selected,r=rotation){
  if(busy)return;
  if(floorCells(id,r).some(([dx,dy])=>x+dx>3||y+dy>3||x+dx<0||y+dy<0)){setHint("ชิ้นนี้เลยขอบห้อง ลองหมุนหรือย้ายเข้าด้านใน");return;}
  setLayout(p=>[...p.filter(t=>t.id!==id),{id,x,y,rotation:r}]);setHint("วางแล้ว · แตะกระเบื้องเพื่อหมุน หรือลากเพื่อย้าย");
 }
 function rotate(id=selected){
  if(busy)return;
  const p=layout.find(t=>t.id===id),r=((p?.rotation??(id===selected?rotation:0))+1)%4;
  setSelected(id);setRotation(r);
  if(p){const cells=floorCells(id,r),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;place(Math.min(p.x,4-w),Math.min(p.y,4-h),id,r);}else setHint("หมุนชิ้นแล้ว · ลากลงพื้นห้อง");
 }
 function position(e:PointerEvent){const b=board.current!.getBoundingClientRect();return {x:Math.floor((e.clientX-b.left)/b.width*4),y:Math.floor((e.clientY-b.top)/b.height*4)};}
 function down(e:PointerEvent<HTMLButtonElement>,id:string,p?:FloorPlacement){
  if(busy||!e.isPrimary||e.button!==0)return;
  const pos=position(e),r=p?.rotation??layout.find(t=>t.id===id)?.rotation??(id===selected?rotation:0);
  tap.current={id,rotate:!!p||id===selected};
  setSelected(id);setRotation(r);suppress.current=false;
  gesture.current={id,r,sx:e.clientX,sy:e.clientY,dx:p?pos.x-p.x:0,dy:p?pos.y-p.y:0,moved:false};
  e.currentTarget.setPointerCapture(e.pointerId);
 }
 function target(e:PointerEvent,g:NonNullable<typeof gesture.current>){const p=position(e),cells=floorCells(g.id,g.r),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;return {id:g.id,x:Math.max(0,Math.min(4-w,p.x-g.dx)),y:Math.max(0,Math.min(4-h,p.y-g.dy)),rotation:g.r};}
 function move(e:PointerEvent<HTMLButtonElement>){
  const g=gesture.current;if(!g)return;
  if(Math.hypot(e.clientX-g.sx,e.clientY-g.sy)>7)g.moved=true;
  if(g.moved){const p=position(e);setGhost(p.x>=0&&p.x<4&&p.y>=0&&p.y<4?target(e,g):null);}
 }
 function up(e:PointerEvent<HTMLButtonElement>){
  const g=gesture.current;if(!g)return;
  if(g.moved){const pos=position(e),p=target(e,g);if(pos.x>=0&&pos.x<4&&pos.y>=0&&pos.y<4)place(p.x,p.y,p.id,p.rotation);else setHint("ปล่อยกระเบื้องในพื้นห้องเพื่อวาง");suppress.current=true;}
  gesture.current=null;setGhost(null);
 }
 function click(id:string,placed:boolean){if(suppress.current){suppress.current=false;tap.current=null;return;}if(placed||(tap.current?.id===id?tap.current.rotate:id===selected))rotate(id);else{setSelected(id);setRotation(layout.find(p=>p.id===id)?.rotation??0);}tap.current=null;}
 const handlers=(id:string,p?:FloorPlacement)=>({onPointerDown:(e:PointerEvent<HTMLButtonElement>)=>down(e,id,p),onPointerMove:move,onPointerUp:up,onPointerCancel:()=>{gesture.current=null;setGhost(null);suppress.current=true;}});
 const covered=new Set(layout.flatMap(p=>floorCells(p.id,p.rotation).map(([x,y])=>(p.x+x)+","+(p.y+y))));
 return <div hidden={screenHidden} className={screenHeader?styles.gameScreen:undefined}>{screenHeader&&<header className={styles.gameHeader}>{screenHeader}</header>}<div className={styles.puzzle}>
  <div className={styles.puzzleGuide}><strong>ปูพื้นให้เต็ม</strong><span>แตะเลือก · แตะซ้ำหมุน · ลากย้าย</span></div>
  <div className={styles.room}><div className={styles.roomTitle}>✦ ห้องเรียน Qmon ✦</div>
   <div ref={board} className={styles.floorSurface} aria-label="พื้นห้องเรียน 4 แถว 4 ช่อง">
    {Array.from({length:16},(_,i)=><button key={i} type="button" className={styles.emptyTile} style={{gridColumn:i%4+1,gridRow:Math.floor(i/4)+1}} disabled={busy} data-floor-cell={i%4+","+Math.floor(i/4)} onClick={()=>place(i%4,Math.floor(i/4))} aria-label={"วางชิ้นที่เลือก แถว "+(Math.floor(i/4)+1)+" ช่อง "+(i%4+1)}><span aria-hidden="true">＋</span></button>)}
    {layout.map(p=>{const cells=floorCells(p.id,p.rotation),w=Math.max(...cells.map(c=>c[0]))+1,h=Math.max(...cells.map(c=>c[1]))+1;
     const overlap=layout.some(o=>o.id!==p.id&&floorCells(o.id,o.rotation).some(([ox,oy])=>cells.some(([x,y])=>p.x+x===o.x+ox&&p.y+y===o.y+oy)));
     return <button key={p.id} type="button" disabled={busy} className={[styles.floorPiece,selected===p.id?styles.selectedTile:"",overlap?styles.overlap:""].join(" ")} style={{gridColumn:(p.x+1)+" / span "+w,gridRow:(p.y+1)+" / span "+h,gridTemplateColumns:"repeat("+w+",1fr)"}} {...handlers(p.id,p)} onClick={()=>click(p.id,true)} aria-label={"กระเบื้อง"+names[p.id]+" แตะเพื่อหมุน ลากเพื่อย้าย"+(overlap?" มีชิ้นซ้อนกัน":"")}>
      {cells.map(([x,y])=><i key={x+","+y} className={styles.ceramic} style={{filter:filters[p.id],gridColumn:x+1,gridRow:y+1}}/>)}<span className={styles.rotateBadge} aria-hidden="true">{overlap?"!":"↻"}</span>
     </button>;
    })}
    {ghost&&floorCells(ghost.id,ghost.rotation).map(([dx,dy])=>{const x=ghost.x+dx,y=ghost.y+dy;return x>=0&&x<4&&y>=0&&y<4?<span key={x+","+y} className={styles.dropGhost} style={{filter:filters[ghost.id],gridColumn:x+1,gridRow:y+1}}/>:null;})}
   </div><div className={styles.floorProgress}>ปูแล้ว {covered.size}/16 ช่อง · ใช้ครบ 4 ชิ้น ไม่ซ้อนกัน</div>
  </div>
  <div className={styles.trayTitle}>ถาดกระเบื้อง <span>ลากลงห้อง · แตะเพื่อหมุน</span></div>
  <div className={styles.pieces} aria-label="ถาดกระเบื้อง 4 ชิ้น">
   {FLOOR_PIECES.map(piece=>{const p=layout.find(t=>t.id===piece.id),cells=floorCells(piece.id,p?.rotation??(selected===piece.id?rotation:0));return <button key={piece.id} type="button" disabled={busy} aria-pressed={selected===piece.id} className={styles.piece} {...handlers(piece.id)} onClick={()=>click(piece.id,false)}>
    <span className={styles.mini} aria-hidden="true">{cells.map(([x,y])=><i key={x+","+y} className={styles.ceramic} style={{filter:filters[piece.id],gridColumn:x+1,gridRow:y+1}}/>)}</span>
    <strong>{names[piece.id]}</strong><span>{p?"วางแล้ว":"ลากลงพื้น"} <b aria-hidden="true">↻</b></span>
   </button>;})}
  </div>
  <div className={styles.buttons}>
   <button type="button" disabled={busy} onClick={()=>rotate()}>↻ หมุน</button>
   <button type="button" disabled={busy||!layout.some(p=>p.id===selected)} onClick={()=>{setLayout(p=>p.filter(t=>t.id!==selected));setHint("ยกกลับถาดแล้ว ลากลงพื้นใหม่ได้");}}>ยกออก</button>
   <button type="button" disabled={busy||!layout.length} onClick={()=>{setLayout([]);setSelected("sun");setRotation(0);setHint("");}}>จัดใหม่</button>
  </div>
  <p role="status" className={styles.floorHint}>{feedback||hint||"ลากจากถาดลงพื้น · แตะชิ้นบนพื้นเพื่อหมุน"}</p>
  <button type="button" className={styles.primary} disabled={busy} onClick={()=>{if(practice){setHint(validateFloor(layout).message);return;}onSubmit(layout);}}>{busy?"กำลังตรวจ…":practice?"✓ ตรวจพื้น":"✓ ตรวจงาน"}</button>
  <p className={styles.help}>วาง หมุน และย้ายได้เต็มที่ จะตรวจเมื่อกดปุ่มเท่านั้น</p>
 </div></div>;
}







