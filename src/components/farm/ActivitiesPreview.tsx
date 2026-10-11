"use client";
import { useState } from "react";
import FarmWorld from "./FarmWorld";
import { previewTiles } from "./LayoutPreview";
const pets = Array.from({ length: 4 }, (_, i) => ({
  id: "activity-" + i,
  nickname: "คู่หูจำลอง " + i,
  speciesName: "Qmon จำลอง",
  imagePath: "/pets/egg3_stage4_science_A.png",
}));
export default function ActivitiesPreview() {
  const [tiles] = useState(() => previewTiles(17)),
    [paused, setPaused] = useState(false);
  return (
    <>
      <p>กิจกรรมจำลอง · ไม่เชื่อมฐานข้อมูล</p>
      <button
        className="min-h-11 rounded bg-white/10 p-2"
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? "เดินเล่นต่อ" : "พักการเดิน"}
      </button>
      <FarmWorld
        tiles={tiles}
        pets={pets}
        paused={paused}
        focusedId={null}
        onSelect={() => {}}
      />
    </>
  );
}
