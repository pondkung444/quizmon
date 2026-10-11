"use client";
import { useState } from "react";
import FarmWorld from "./FarmWorld";
import { validateFarmLayout, type BridgeOrientation } from "@/lib/farm/layout";
import type { FarmTile } from "@/lib/farm/world";
import type { FarmPet } from "./FarmMeadow";
import { saveFarmLayout } from "@/app/collection/layout/actions";
export type ReadyPlot = { id: string; kind: FarmTile["kind"]; name: string };
const names = {
  meadow: "ลาน",
  residence: "อาคาร Qmon",
  eggs: "คลังไข่",
  school: "โรงเรียน",
  garden: "สวนพักผ่อน",
  pond: "บ่อน้ำ",
  flower: "สวนดอกไม้",
  bridge: "สะพาน",
  observatory: "หอดูดาว",
};
export default function LayoutClient({
  initialTiles,
  pets = [],
  ready = [],
  save = saveFarmLayout,
}: {
  initialTiles: FarmTile[];
  pets?: FarmPet[];
  ready?: ReadyPlot[];
  save?: typeof saveFarmLayout;
}) {
  const [tiles, setTiles] = useState(initialTiles),
    [selected, setSelected] = useState(""),
    [operation, setOperation] = useState<"move" | "place">("move"),
    [point, setPoint] = useState<{ x: number; y: number } | null>(null),
    [orientation, setOrientation] = useState<BridgeOrientation>(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const current =
    operation === "move"
      ? tiles.find((t) => t.id === selected)
      : ready.find((t) => t.id === selected);
  const preview =
    current && point
      ? ({
          id:
            operation === "move" &&
            "x" in current &&
            current.x === point.x &&
            current.y === point.y
              ? selected
              : "preview:" + selected,
          kind: current.kind,
          x: point.x,
          y: point.y,
          level: "level" in current ? current.level : 1,
          orientation,
        } as FarmTile)
      : null;
  const candidate =
    current && point
      ? operation === "move"
        ? tiles.map((t) =>
            t.id === selected ? { ...t, ...point, orientation } : t,
          )
        : [
            ...tiles,
            {
              id: selected,
              kind: current.kind,
              ...point,
              level: 1,
              orientation,
            },
          ]
      : tiles;
  const verdict = validateFarmLayout(candidate);
  async function confirm() {
    if (!point || !selected || !verdict.valid) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await save(
        operation,
        selected,
        point.x,
        point.y,
        orientation,
      );
      setTiles(next);
      setPoint(null);
      setSelected("");
      setMessage("บันทึกผังแล้ว · Qmon จะคำนวณทางเดินใหม่");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "เชื่อมต่อไม่สำเร็จ ยังเลือกจุดเดิมหรือจุดใหม่แล้วลองได้",
      );
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string, mode: "move" | "place") {
    setSelected(id);
    setOperation(mode);
    const chosen = mode === "move" ? tiles.find((t) => t.id === id) : null;
    setPoint(chosen?.kind === "bridge" ? { x: chosen.x, y: chosen.y } : null);
    setOrientation(
      (mode === "move" ? tiles.find((t) => t.id === id)?.orientation : 0) ?? 0,
    );
    setMessage("");
  }
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-bold">
        จัดผังฟาร์ม · {tiles.length}/24 ชิ้น
      </h1>
      <p>
        ย้ายฟรีทีละชิ้น ทุกชิ้นต้องเชื่อมกันและไม่ซ้อน ·
        สะพานต่อได้เฉพาะหัวท้ายตามทิศที่เลือก
      </p>
      <label className="block">
        ย้ายชิ้นที่มี
        <select
          aria-label="ย้ายชิ้นที่มี"
          className="min-h-11 w-full rounded bg-slate-800 p-2"
          value={operation === "move" ? selected : ""}
          disabled={busy}
          onChange={(e) => choose(e.target.value, "move")}
        >
          <option value="">เลือกชิ้น</option>
          {tiles.map((t) => (
            <option key={t.id} value={t.id}>
              {names[t.kind]} · ({t.x},{t.y})
            </option>
          ))}
        </select>
      </label>
      {ready.length > 0 && (
        <label className="block">
          งานพร้อมวาง
          <select
            aria-label="งานพร้อมวาง"
            className="min-h-11 w-full rounded bg-slate-800 p-2"
            value={operation === "place" ? selected : ""}
            disabled={busy}
            onChange={(e) => choose(e.target.value, "place")}
          >
            <option value="">เลือกโครงการ</option>
            {ready
              .filter((r) => !tiles.some((t) => t.id === r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <FarmWorld
        tiles={tiles}
        pets={pets.slice(0, 3)}
        paused={!!selected}
        focusedId={null}
        onSelect={() => {}}
        onPlaceTile={
          selected && !busy ? (x, y) => setPoint({ x, y }) : undefined
        }
        placementLabel={current ? names[current.kind] : "ชิ้น"}
        previewTile={preview}
      />
      {current?.kind === "bridge" && (
        <button
          className="min-h-11 rounded bg-white/10 px-3"
          disabled={busy}
          onClick={() => setOrientation((old) => (old === 0 ? 1 : 0))}
        >
          หมุนสะพาน · {orientation === 0 ? "ตะวันตก ↔ ตะวันออก" : "เหนือ ↔ ใต้"}
        </button>
      )}
      {point && (
        <>
          <p role="status">
            ภาพก่อน{operation === "move" ? "ย้าย" : "วาง"} ({point.x},{point.y})
            · {verdict.message}
          </p>
          <button
            className="min-h-11 rounded bg-amber-700 px-4"
            disabled={busy || !verdict.valid}
            onClick={confirm}
          >
            {busy
              ? "กำลังบันทึก…"
              : "ยืนยัน" + (operation === "move" ? "ย้าย" : "วาง")}
          </button>
          <button
            className="ml-3 min-h-11"
            disabled={busy}
            onClick={() => setPoint(null)}
          >
            เลือกจุดใหม่
          </button>
        </>
      )}
      {selected && (
        <button
          className="min-h-11"
          disabled={busy}
          onClick={() => {
            setSelected("");
            setPoint(null);
          }}
        >
          กลับไปดูผังเดิม
        </button>
      )}
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
