"use client";
import { useState, useRef } from "react";
import LayoutClient from "./LayoutClient";
import FarmWorld from "./FarmWorld";
import { INITIAL_FARM, type FarmTile } from "@/lib/farm/world";
import { previewFarmMove } from "@/lib/farm/layout";
import type { saveFarmLayout } from "@/app/collection/layout/actions";
export function previewTiles(count = 17): FarmTile[] {
  const tiles: FarmTile[] = [
    ...INITIAL_FARM,
    { id: "main-school", kind: "school", x: 1, y: 1, level: 4 },
  ];
  const kinds = [
    "garden",
    "garden",
    "garden",
    "garden",
    "pond",
    "pond",
    "pond",
    "flower",
    "flower",
    "flower",
    "bridge",
    "bridge",
    "observatory",
  ] as const;
  const coords = [
    [2, 0],
    [3, 0],
    [4, 0],
    [2, 1],
    [3, 1],
    [4, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [2, 3],
    [3, 3],
  ];
  for (const [i, kind] of kinds.entries())
    tiles.push({
      id: "preview-place-" + i,
      kind,
      x: coords[i][0],
      y: coords[i][1],
      level: 1,
      orientation: 0,
    });
  for (let i = 17; i < count; i++)
    tiles.push({
      id: "stress-" + i,
      kind: "garden",
      x: i - 17,
      y: 4,
      level: 1,
    });
  return tiles;
}
export default function LayoutPreview({ count = 17 }: { count?: number }) {
  const [initialTiles] = useState(() => previewTiles(count));
  const current = useRef(initialTiles);
  const pets = Array.from({ length: 3 }, (_, i) => ({
    id: "mock-" + i,
    nickname: "Qmon จำลอง " + (i + 1),
    speciesName: "Qmon จำลอง",
    imagePath: "/pets/egg3_stage4_science_A.png",
  }));
  const save: typeof saveFarmLayout = async (
    operation,
    id,
    x,
    y,
    orientation,
  ) => {
    if (operation !== "move") throw Error("ตัวอย่างนี้ย้ายเฉพาะชิ้นที่มี");
    const next = previewFarmMove(current.current, id, x, y, orientation);
    if (!next.valid) throw Error(next.message);
    current.current = next.tiles;
    return next.tiles;
  };
  if (count === 24)
    return (
      <>
        <p>
          ผัง 24 ชิ้นจำลองสำหรับวัดการแสดงผล · มีจำนวนรายชนิดเกินกติกาซื้อจริง
        </p>
        <FarmWorld
          tiles={initialTiles}
          pets={pets}
          paused={false}
          focusedId={null}
          onSelect={() => {}}
        />
      </>
    );
  return (
    <>
      <p>ผังจำลอง 17 ชิ้น · บันทึกเฉพาะหน้าจอนี้ ไม่มีข้อมูลบัญชีจริง</p>
      <LayoutClient initialTiles={initialTiles} pets={pets} save={save} />
    </>
  );
}
