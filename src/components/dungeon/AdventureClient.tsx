"use client";

import type { DungeonInfo, DungeonRunDetail, EligiblePet } from "@/lib/dungeon";
import PreDeparture from "@/components/dungeon/PreDeparture";
import InProgressScreen from "@/components/dungeon/InProgressScreen";
import ClaimScreen from "@/components/dungeon/ClaimScreen";

export type AdventureView =
  | { kind: "predeparture"; dungeon: DungeonInfo; pets: EligiblePet[]; pityMeter: number }
  | { kind: "traveling"; dungeon: DungeonInfo; run: DungeonRunDetail; pityMeter: number }
  | { kind: "claimable"; dungeon: DungeonInfo; run: DungeonRunDetail; pityMeter: number };

// จุดกระจายจอ A/B/C ตามสถานะที่ page.tsx (server) เตรียมมาให้ — แต่ละจอเป็น client component
// แยกไฟล์ (ต้องมี state/timer ของตัวเอง) รวมไว้ที่นี่จุดเดียวแทนที่จะ if/else ใน page.tsx ตรงๆ
export default function AdventureClient({ view }: { view: AdventureView }) {
  if (view.kind === "predeparture") {
    return <PreDeparture dungeon={view.dungeon} pets={view.pets} pityMeter={view.pityMeter} />;
  }
  if (view.kind === "traveling") {
    return <InProgressScreen dungeon={view.dungeon} initialRun={view.run} pityMeter={view.pityMeter} />;
  }
  return <ClaimScreen dungeon={view.dungeon} run={view.run} pityMeter={view.pityMeter} />;
}
