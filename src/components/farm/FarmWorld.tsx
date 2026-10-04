"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import FarmResidents from "./FarmResidents";
import type { FarmPet } from "./FarmMeadow";
import { availableFarmPlots, tileKey, type FarmTile } from "../../lib/farm/world";
import { farmGeometry, projectFarmPoint, occupiedFarmRectangle } from "../../lib/farm/isometric";
import styles from "./farm-world.module.css";

const BASE_TILE_SIZE = 360;

export default function FarmWorld({ tiles, pets, paused, focusedId, onSelect, onPlaceTile }: {
  tiles: readonly FarmTile[];
  pets: readonly FarmPet[];
  paused: boolean;
  focusedId: string | null;
  onSelect: (id: string) => void;
  onPlaceTile?: (x: number, y: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [target, setTarget] = useState<"home" | "all">("all");
  const [revision, setRevision] = useState(0);
  const size = BASE_TILE_SIZE * zoom;
  const geometry = farmGeometry(tiles, size);
  const home = tiles.find(tile => tile.kind === "meadow") ?? tiles[0];
  const occupied = new Set(tiles.map(tile => tileKey(tile.x, tile.y)));
  const plots = availableFarmPlots(tiles);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
      const area = occupiedFarmRectangle(tiles, BASE_TILE_SIZE);
      setZoom(Math.max(.25, Math.min(1, (view.clientWidth - 32) / area.width, (view.clientHeight - 36) / area.height)));
      setTarget("all");
      setRevision(value => value + 1);
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(view);
    fit();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [tiles]);

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    const frame = requestAnimationFrame(() => {
      const area = occupiedFarmRectangle(tiles, size);
      const center = target === "all" ? { x: area.x + area.width / 2, y: area.y + area.height / 2 } : projectFarmPoint((home?.x ?? 0) + .7, (home?.y ?? 0) + .7, farmGeometry(tiles, size));
      view.scrollTo({ left: Math.max(0, center.x - view.clientWidth / 2), top: Math.max(0, center.y - view.clientHeight / 2), behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [tiles, size, home?.x, home?.y, target, revision]);

  function showAll() {
    const view = viewport.current;
    if (!view) return;
    const area = occupiedFarmRectangle(tiles, BASE_TILE_SIZE);
    setZoom(Math.max(.25, Math.min(1, (view.clientWidth - 32) / area.width, (view.clientHeight - 36) / area.height)));
    setTarget("all");
    setRevision(value => value + 1);
  }

  return <div className={styles.world}>
    <div className={styles.viewport} ref={viewport} tabIndex={0} role="region" aria-label="แผนที่ฟาร์มเกาะลอย เลื่อนเพื่อดูพื้นที่ข้างเคียง"
      onPointerDown={event => {
        if (event.pointerType !== "mouse" || event.button !== 0 || (event.target as HTMLElement).closest("button,a")) return;
        drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
        event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}>
      <div className={styles.canvas} style={{ width: geometry.width, height: geometry.height }}>
        {onPlaceTile && plots.map(plot => {
          const point = projectFarmPoint(plot.x + .5, plot.y + .5, geometry);
          return <button type="button" key={tileKey(plot.x, plot.y)} className={styles.placeButton}
            style={{ left: point.x, top: point.y, width: size * .65, height: size * .32 }}
            onClick={() => onPlaceTile(plot.x, plot.y)} aria-label={`วางโรงเรียนที่ ${plot.x}, ${plot.y}`}>
            <span>＋ วางโรงเรียน</span>
          </button>;
        })}
        {[...tiles].sort((a, b) => (a.x + a.y) - (b.x + b.y)).map(tile => {
          const point = projectFarmPoint(tile.x, tile.y, geometry);
          const spriteSize = size / .96;
          const spriteHeight = spriteSize * .857;
          return <div key={tile.id} data-farm-tile={tile.kind} data-x={tile.x} data-y={tile.y} className={styles.island}
            style={{ left: point.x - spriteSize / 2, top: point.y - spriteHeight * .04, width: spriteSize, height: spriteHeight }}>
            <Image src="/farm/qmon-island-v3.webp" alt="" fill sizes="420px" className={styles.islandImage} draggable={false} priority={tile.id === home?.id} />
          </div>;
        })}
        <svg className={styles.paths} width={geometry.width} height={geometry.height} aria-hidden="true">
          {tiles.flatMap(tile => [{x:1,y:0},{x:0,y:1}].filter(offset => occupied.has(tileKey(tile.x+offset.x,tile.y+offset.y))).map(offset => {
            const start = projectFarmPoint(tile.x+.5,tile.y+.5,geometry);
            const end = projectFarmPoint(tile.x+offset.x+.5,tile.y+offset.y+.5,geometry);
            return <line key={`${tile.id}:${offset.x},${offset.y}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#d8bc7e" strokeWidth={size*.055} strokeLinecap="round" opacity=".6"/>;
          }))}
        </svg>
        {tiles.filter(tile => tile.kind !== "meadow").map(tile => {
          const foot = projectFarmPoint(tile.x+.73,tile.y+.73,geometry);
          const title = tile.kind === "residence" ? "ฟาร์ม Qmon" : tile.kind === "eggs" ? "คลังไข่" : "โรงเรียน";
          const source = tile.kind === "residence" ? "/farm/qmon-residence-v2.webp" : tile.kind === "eggs" ? "/farm/qmon-egg-storage-v2.webp" : "/farm/qmon-school-l1-v1.webp";
          const destination = tile.kind === "residence" ? "/collection/qmon" : tile.kind === "eggs" ? "/eggs" : "/collection/school";
          const content = <><Image src={source} alt="" fill sizes="250px" draggable={false} />
            <span className={`${styles.buildingLabel} ${tile.kind === "residence" ? styles.residenceLabel : tile.kind === "eggs" ? styles.eggsLabel : ""}`}><strong>{title}</strong><small>{destination ? "แตะเพื่อดู →" : `ระดับ ${tile.level}`}</small></span></>;
          const placement = {left:foot.x,top:foot.y,width:size*.62,height:size*.62,zIndex:10000+Math.round(foot.y*10)};
          if (destination) return <Link key={tile.id} href={destination} aria-label={tile.kind === "residence" ? "อาคารฟาร์ม Qmon ดู Qmon ร่าง 4 ที่มี" : tile.kind === "eggs" ? "คลังไข่ ดูไข่ที่มี" : "โรงเรียน ระดับ 1 ดูโครงการ"} className={`${styles.building} ${styles.buildingLink}`} style={placement}>{content}</Link>;
          return <div key={tile.id} className={styles.building} style={{left:foot.x,top:foot.y,width:size*.62,height:size*.62,zIndex:10000+Math.round(foot.y*10)}}>
            {content}
          </div>;
        })}
        <FarmResidents pets={pets} tiles={tiles} tileSize={size} paused={paused} focusedId={focusedId} onSelect={onSelect}/>
      </div>
    </div>
    <div className={styles.camera} aria-label="มุมมองฟาร์ม">
      <button type="button" onClick={() => setZoom(value => Math.max(.25,value-.2))} disabled={zoom<=.25} aria-label="ซูมออก">−</button>
      <span>{Math.round(zoom*100)}%</span>
      <button type="button" onClick={() => setZoom(value => Math.min(1.4,value+.2))} disabled={zoom>=1.4} aria-label="ซูมเข้า">＋</button>
      <button type="button" onClick={showAll}>ดูทั้งฟาร์ม</button>
      <button type="button" onClick={() => {setZoom(1);setTarget("home");setRevision(value=>value+1);}}>กลับลาน</button>
    </div>
    <p className={styles.hint}>แตะอาคารเพื่อเข้าไปดู · ลากเพื่อเลื่อนแผนที่</p>
  </div>;
}
