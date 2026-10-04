"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { FarmPet } from "./FarmMeadow";
import { CELLS_PER_TILE, cellKey, farmWalkableCells, farmWalkingPath, type FarmCell } from "../../lib/farm/navigation";
import { type FarmTile } from "../../lib/farm/world";
import { farmGeometry, projectFarmPoint } from "../../lib/farm/isometric";
import styles from "./farm-residents.module.css";

type Walker = { id: string; element: HTMLDivElement; cell: FarmCell; next: FarmCell | null; route: FarmCell[]; timer?: ReturnType<typeof setTimeout>; animation?: Animation };

export default function FarmResidents({ pets, tiles, tileSize, paused, focusedId, onSelect }: {
  pets: readonly FarmPet[];
  tiles: readonly FarmTile[];
  tileSize: number;
  paused: boolean;
  focusedId: string | null;
  onSelect: (id: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const remembered = useRef(new Map<string, FarmCell>());
  const controls = useRef({ paused, focusedId });
  const synchronizeRef = useRef<(() => void) | null>(null);
  const geometry = farmGeometry(tiles, tileSize);
  const home = tiles.find(tile => tile.kind === "meadow");
  const petIds = pets.map(pet => pet.id).join(",");

  useEffect(() => {
    controls.current = { paused, focusedId };
    synchronizeRef.current?.();
  }, [paused, focusedId]);

  useEffect(() => {
    const cells = farmWalkableCells(tiles);
    const positions = remembered.current;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const reservations = new Map<string, string>();
    const walkers: Walker[] = [];
    let visible = false;
    const geometry = farmGeometry(tiles, tileSize);
    const transform = (cell: FarmCell) => {
      const point = projectFarmPoint((cell.x + .5) / CELLS_PER_TILE, (cell.y + .5) / CELLS_PER_TILE, geometry);
      return `translate3d(${point.x}px, ${point.y}px, 0)`;
    };
    function occupiedByOthers(id: string) { return new Set([...reservations].filter(([, owner]) => owner !== id).map(([key]) => key)); }
    function place(walker: Walker) {
      walker.element.style.transform = transform(walker.cell);
      const foot = projectFarmPoint((walker.cell.x + .5) / CELLS_PER_TILE, (walker.cell.y + .5) / CELLS_PER_TILE, geometry);
      walker.element.style.zIndex = String(10000 + Math.round(foot.y * 10));
      walker.element.dataset.cell = cellKey(walker.cell);
    }
    for (const [index, id] of petIds.split(",").filter(Boolean).entries()) {
      const element = refs.current.get(id);
      if (!element) continue;
      const saved = positions.get(id);
      const initial = saved && cells.has(cellKey(saved)) && !reservations.has(cellKey(saved)) ? saved : [...cells.values()].find(cell => cell.x === (home?.x ?? 0) * CELLS_PER_TILE + [1, 3, 4][index] && cell.y === (home?.y ?? 0) * CELLS_PER_TILE + [3, 4, 2][index]) ?? [...cells.values()].find(cell => !reservations.has(cellKey(cell)));
      if (!initial) continue;
      const walker: Walker = { id, element, cell: initial, next: null, route: [] };
      reservations.set(cellKey(initial), id);
      place(walker);
      walkers.push(walker);
    }
    function canWalk(walker: Walker) { return visible && !document.hidden && !preference.matches && !controls.current.paused && controls.current.focusedId !== walker.id; }
    function schedule(walker: Walker, delay: number) { clearTimeout(walker.timer); if (canWalk(walker)) walker.timer = setTimeout(() => advance(walker), delay); }
    function advance(walker: Walker) {
      if (!canWalk(walker)) return;
      if (walker.animation?.playState === "paused") { walker.animation.play(); walker.element.dataset.walking = "true"; return; }
      const occupied = occupiedByOthers(walker.id);
      if (!walker.route.length || occupied.has(cellKey(walker.route[0]))) {
        walker.route = [];
        const candidates = [...cells.values()].filter(cell => !occupied.has(cellKey(cell)) && Math.abs(cell.x - walker.cell.x) + Math.abs(cell.y - walker.cell.y) >= 3);
        for (let attempt = 0; attempt < 8 && candidates.length && !walker.route.length; attempt++) {
          walker.route = farmWalkingPath(cells, walker.cell, candidates[Math.floor(Math.random() * candidates.length)], occupied);
        }
      }
      const next = walker.route.shift();
      if (!next || reservations.has(cellKey(next))) { walker.route = []; schedule(walker, 1400); return; }
      reservations.set(cellKey(next), walker.id);
      walker.next = next;
      const dx = (next.x - next.y) - (walker.cell.x - walker.cell.y);
      if (dx) walker.element.style.setProperty("--facing", dx < 0 ? "-1" : "1");
      walker.element.dataset.walking = "true";
      walker.animation = walker.element.animate([{ transform: transform(walker.cell) }, { transform: transform(next) }], { duration: 1800 + (walkers.indexOf(walker) % 3) * 250, easing: "linear", fill: "forwards" });
      walker.animation.onfinish = () => {
        reservations.delete(cellKey(walker.cell));
        walker.cell = next;
        walker.next = null;
        positions.set(walker.id, next);
        place(walker);
        walker.animation?.cancel();
        walker.animation = undefined;
        if (walker.route.length) schedule(walker, 50);
        else { walker.element.dataset.walking = "false"; schedule(walker, 2000 + Math.random() * 3500); }
      };
    }
    function synchronize() {
      for (const walker of walkers) {
        clearTimeout(walker.timer);
        if (!canWalk(walker)) { walker.animation?.pause(); walker.element.dataset.walking = "false"; }
        else schedule(walker, 600 + walkers.indexOf(walker) * 550);
      }
    }
    synchronizeRef.current = synchronize;
    const surface = walkers[0]?.element.parentElement?.parentElement?.parentElement;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; synchronize(); });
    if (surface) observer.observe(surface);
    document.addEventListener("visibilitychange", synchronize);
    preference.addEventListener("change", synchronize);
    return () => {
      synchronizeRef.current = null;
      observer.disconnect();
      document.removeEventListener("visibilitychange", synchronize);
      preference.removeEventListener("change", synchronize);
      for (const walker of walkers) {
        clearTimeout(walker.timer);
        // Keep the logical location; navigation/zoom never carries a pet into a building.
        positions.set(walker.id, walker.cell);
        walker.animation?.cancel();
        walker.element.dataset.walking = "false";
      }
    };
  }, [petIds, tiles, tileSize, home?.x, home?.y]);

  return <div className={styles.residents} aria-label="Qmon เดินเล่นในฟาร์ม">
    {pets.map((pet, index) => {
      const initial = projectFarmPoint((home?.x ?? 0) + .25 + index * .2, (home?.y ?? 0) + .6, geometry);
      return <div key={pet.id} ref={element => { if (element) refs.current.set(pet.id, element); else refs.current.delete(pet.id); }} className={styles.mover} data-farm-resident={pet.id} style={{ width: Math.max(44, tileSize * .17), transform: `translate3d(${initial.x}px, ${initial.y}px, 0)` }}>
      <button type="button" className={styles.pet} aria-label={`ดู ${pet.nickname ?? pet.speciesName}`} onClick={() => onSelect(pet.id)}>
        <span className={styles.shadow} aria-hidden="true" />
        <Image src={pet.imagePath} alt={pet.speciesName} width={160} height={160} sizes="100px" className={styles.sprite} draggable={false} />
      </button>
    </div>;})}
  </div>;
}
