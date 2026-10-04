"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FarmWorld from "./FarmWorld";
import { INITIAL_FARM, type FarmTile } from "../../lib/farm/world";
import { sampleFarmResidents } from "../../lib/farm/residents";
import styles from "./farm-meadow.module.css";

export type FarmPet = { id: string; nickname: string | null; imagePath: string; speciesName: string };

export default function FarmMeadow({ pets, tiles = INITIAL_FARM, onPlaceTile }: {
  pets: FarmPet[];
  tiles?: readonly FarmTile[];
  onPlaceTile?: (x: number, y: number) => void;
}) {
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
    <FarmWorld tiles={tiles} pets={visitors} paused={paused} focusedId={focusedId} onSelect={setFocusedId} onPlaceTile={onPlaceTile} />
    <div className={styles.toolbar}>
      <p>{pets.length === 0 ? "เมื่อเก็บ Qmon ร่าง 4 เข้าฟาร์ม คู่หูจะออกมาเดินเล่นเอง" : "Qmon สุ่มออกมาเดินเล่นครั้งละไม่เกิน 3 ตัว · แตะตัวเพื่อดูรายละเอียด"}</p>
      {visitors.length > 0 && <button type="button" className={styles.secondaryButton} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "เดินเล่นต่อ" : "พักการเดิน"}</button>}
    </div>
    {focused && <div className={styles.petInfo}>
      <div><strong>{focused.nickname ?? focused.speciesName}</strong><p>{focused.speciesName} · ร่าง 4</p></div>
      <Link href={`/collection/${focused.id}`} className={styles.secondaryButton}>ดูรายละเอียด</Link>
      <button type="button" className={styles.secondaryButton} onClick={() => setFocusedId(null)}>ปิด</button>
    </div>}
  </section>;
}
