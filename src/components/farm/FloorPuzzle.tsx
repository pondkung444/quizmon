"use client";
import { useState } from "react";
import { FLOOR_PIECES,floorCells,validateFloor,type FloorPlacement } from "@/lib/farm/floor-puzzle";
import styles from "./school.module.css";

export default function FloorPuzzle({busy,practice,onSubmit}:{busy:boolean;practice:boolean;onSubmit:(layout:FloorPlacement[])=>void}) {
  const [layout,setLayout]=useState<FloorPlacement[]>([]);
  const [selected,setSelected]=useState<string>("sun");
  const [rotation,setRotation]=useState(0);
  const [hint,setHint]=useState("");
  function place(x:number,y:number,id=selected,r=rotation) {
    if(busy) return;
    const cells=floorCells(id,r).map(([dx,dy])=>[x+dx,y+dy]);
    if(cells.some(([cx,cy])=>cx>3||cy>3||cx<0||cy<0)) {setHint("แผ่นพื้นเลยขอบห้อง ลองหมุนหรือเปลี่ยนจุดวาง");return;}
    // Exploration is free: overlaps are visible and count only on Check work.
    setLayout(previous=>[...previous.filter(p=>p.id!==id),{id,x,y,rotation:r}]); setHint("");
  }
  function select(id:string) {if(id!==selected){setSelected(id);setRotation(layout.find(p=>p.id===id)?.rotation ?? 0);}}
  return <div className={styles.puzzle}>
    <p className={styles.help}>เลือกแผ่นพื้นแล้วแตะช่องที่จะวาง หรือลากแผ่นลงห้อง · แตะหมุนก่อนวาง</p>
    <div className={styles.board} aria-label="พื้นห้องเรียน 4 แถว 4 ช่อง">
      {Array.from({length:16},(_,i)=>{
        const x=i%4,y=Math.floor(i/4);
        const covering=layout.filter(p=>floorCells(p.id,p.rotation).some(([dx,dy])=>p.x+dx===x&&p.y+dy===y));
        const piece=FLOOR_PIECES.find(p=>p.id===covering[0]?.id);
        return <button key={i} type="button" data-floor-cell={`${x},${y}`} disabled={busy} onClick={()=>place(x,y)}
          aria-label={`วางแผ่นที่แถว ${y+1} ช่อง ${x+1}${covering.length>1?" มีแผ่นซ้อนกัน":piece?` ${piece.name}`:" ว่าง"}`}
          style={{background:piece?.color}} className={covering.length>1?styles.overlap:""}>{covering.length>1?"!":piece?FLOOR_PIECES.indexOf(piece)+1:"·"}</button>;
      })}
    </div>
    <div className={styles.pieces} aria-label="แผ่นพื้น 4 ชิ้น">
      {FLOOR_PIECES.map((piece,index)=><button key={piece.id} type="button" disabled={busy} aria-pressed={selected===piece.id}
        onClick={()=>select(piece.id)} onPointerDown={event=>{if(busy)return;select(piece.id);event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerUp={event=>{
          if(busy)return; const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-floor-cell]');
          const position=target?.getAttribute('data-floor-cell')?.split(',').map(Number);
          if(position)place(position[0],position[1],piece.id,selected===piece.id?rotation:(layout.find(p=>p.id===piece.id)?.rotation ?? 0));
        }} className={styles.piece} style={{borderColor:piece.color,touchAction:"none"}}>
        <span>{index+1} {piece.name}{layout.some(p=>p.id===piece.id)?" ✓":""}</span>
        <span className={styles.mini} aria-hidden="true">{floorCells(piece.id,selected===piece.id?rotation:0).map(([x,y])=><i key={`${x},${y}`} style={{gridColumn:x+1,gridRow:y+1,background:piece.color}}/>)}</span>
      </button>)}
    </div>
    <div className={styles.buttons}>
      <button type="button" disabled={busy} onClick={()=>setRotation(r=>(r+1)%4)}>↻ หมุนชิ้นที่เลือก</button>
      <button type="button" disabled={busy} onClick={()=>{setLayout(p=>p.filter(piece=>piece.id!==selected));setHint("");}}>ยกชิ้นที่เลือกออก</button>
      <button type="button" disabled={busy} onClick={()=>{setLayout([]);setHint("");}}>เริ่มจัดใหม่</button>
    </div>
    {hint && <p role="status" className={styles.notice}>{hint}</p>}
    <button type="button" className={styles.primary} disabled={busy} onClick={()=>{
      if(practice){setHint(validateFloor(layout).message);return;}onSubmit(layout);
    }}>{busy?"กำลังตรวจ…":practice?"ตรวจงานฝึก":"ตรวจงาน"}</button>
    <p className={styles.help}>ลองวางและหมุนได้เต็มที่ ยังไม่นับผิดจนกว่าจะกดตรวจงาน</p>
  </div>;
}
