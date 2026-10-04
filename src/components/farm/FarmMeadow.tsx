"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { schoolCommand } from "@/app/collection/school/actions";
import { SCHOOL_LABELS, type SchoolProject } from "@/lib/farm/school";
import FarmWorld from "./FarmWorld";
import { INITIAL_FARM, type FarmTile } from "../../lib/farm/world";
import { sampleFarmResidents } from "../../lib/farm/residents";
import styles from "./farm-meadow.module.css";

export type FarmPet = { id: string; nickname: string | null; imagePath: string; speciesName: string };

export default function FarmMeadow({ pets, tiles = INITIAL_FARM, onPlaceTile, school = null, placing = false }: {
  pets: FarmPet[];
  school?: SchoolProject | null;
  placing?: boolean;
  tiles?: readonly FarmTile[];
  onPlaceTile?: (x: number, y: number) => void;
}) {
  const router = useRouter();
  const [placementError,setPlacementError] = useState("");
  const [saving,setSaving] = useState(false);
  async function placeSchool(x:number,y:number) {
    if(saving)return;setSaving(true);setPlacementError("");
    try {const result=await schoolCommand("place",{x,y});if(result.error)setPlacementError(result.error);else {router.replace("/collection");router.refresh();}}
    catch {setPlacementError("เชื่อมต่อไม่สำเร็จ ลองวางอีกครั้งได้");}
    finally {setSaving(false);}
  }
  const [visitors, setVisitors] = useState<FarmPet[]>([]);
  const [paused, setPaused] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Sample after hydration, once on entry / when the owned list changes.
  useEffect(() => {
    const frame = requestAnimationFrame(() => { setVisitors(sampleFarmResidents(pets)); setFocusedId(null); });
    return () => cancelAnimationFrame(frame);
  }, [pets]);
  const focused = visitors.find(pet => pet.id === focusedId);

  return <section className={styles.card} aria-labelledby="meadow-heading">
    <div className={styles.heading}>
      <h1 id="meadow-heading">ฟาร์มของเรา</h1>
      <Link href="/collection/album" className={styles.secondaryButton}>สมุดสะสม</Link>
    </div>
    {school?.status !== "placed" && <Link href="/collection/school" className={styles.schoolEntry}>🏫 {SCHOOL_LABELS[school?.status ?? "draft"]}<small>แตะเพื่อดูโครงการและ Qmon คุมงาน →</small></Link>}
    <FarmWorld tiles={tiles} pets={visitors} paused={paused} focusedId={focusedId} onSelect={setFocusedId} onPlaceTile={placing ? placeSchool : onPlaceTile} />
    <div className={styles.toolbar}>
      <p>{placing ? (saving ? "กำลังวางโรงเรียน…" : placementError || "แตะช่อง ＋ เพื่อวางโรงเรียนบนพื้นที่ที่ต่อกับฟาร์ม") : pets.length === 0 ? "เมื่อเก็บ Qmon ร่าง 4 เข้าฟาร์ม คู่หูจะออกมาเดินเล่นเอง" : "Qmon สุ่มออกมาเดินเล่นครั้งละไม่เกิน 3 ตัว · แตะตัวเพื่อดูรายละเอียด"}</p>
      {visitors.length > 0 && <button type="button" className={styles.secondaryButton} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "เดินเล่นต่อ" : "พักการเดิน"}</button>}
    </div>
    {focused && <div className={styles.petInfo}>
      <div><strong>{focused.nickname ?? focused.speciesName}</strong><p>{focused.speciesName} · ร่าง 4</p></div>
      <Link href={`/collection/${focused.id}`} className={styles.secondaryButton}>ดูรายละเอียด</Link>
      <button type="button" className={styles.secondaryButton} onClick={() => setFocusedId(null)}>ปิด</button>
    </div>}
  </section>;
}
