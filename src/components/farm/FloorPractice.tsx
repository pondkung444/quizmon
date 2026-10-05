"use client";
import Link from "next/link";
import FloorPuzzle from "./FloorPuzzle";
export default function FloorPractice(){
 return <FloorPuzzle busy={false} practice onSubmit={()=>{}} screenHeader={<><Link href="/collection/school" aria-label="กลับโรงเรียน">← กลับ</Link><h1>จัดพื้นห้องเรียน</h1><span>รอบฝึก</span></>}/>;
}
