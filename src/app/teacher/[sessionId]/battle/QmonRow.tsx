"use client";

import Image from "next/image";
import { memo, useState } from "react";
import { isTileUsable, rosterAlt, rosterLayout, type CentralRosterMember } from "@/lib/teamBattle/centralRoster";
import type { TeamId } from "@/lib/teamBattle/types";
import css from "./qmon-row.module.css";

const BOB_PERIOD_S = 2.8;
// ช่องของ Qmon ที่ไม่มีรูป (ไม่มีคู่หู หรือรูปโหลดไม่ได้) — ตัวอักษรกลางๆ ไม่ผูกกับชื่อใคร
const NO_PET_LABEL = "Q";

// รูปเดียวของแถว: next/image ตรงๆ, alt ว่าง (ป้ายอ่านออกเสียงอยู่ที่ตัวห่อแถว)
// src เป็น null หรือโหลดไม่ได้ (onError) → ช่อง "Q" เดียวกัน ไม่ให้ขึ้นไอคอนรูปเสีย
function QmonTile({ src }: { src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = isTileUsable(src, failedSrc);
  return (
    <div className={`${css.cell} ${usable ? "" : css.noPet}`}>
      {usable ? (
        <Image
          src={src}
          alt=""
          fill
          sizes="96px"
          className={css.img}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className={css.q}>{NO_PET_LABEL}</span>
      )}
    </div>
  );
}

// แถว Qmon ของทีมบนจอกลาง (ต้องอยู่ใน .region ของ qmon-row.module.css) — ห่อ memo
// เพราะ BattleCentral re-render ทุก 250 ms (interval ของ now); members ต้องเป็น array ตัวเดิม
// (มาจาก state ของ useCentralRoster) จึงไม่ re-render รูป ~30 ตัวทุกจังหวะ
// ไม่มีชื่อ/id รายคน: alt เว้นว่างทุกรูป ป้ายอ่านออกเสียงอยู่ที่ตัวห่อ ("Qmon ทีม A n ตัว")
function QmonRowImpl({ team, members }: { team: TeamId; members: readonly CentralRosterMember[] }) {
  if (members.length === 0) return null;
  const { shown, extra, cols, rows } = rosterLayout(members.length);
  return (
    <div
      className={css.row}
      style={{ "--cols": cols, "--rows": rows } as React.CSSProperties}
      role="img"
      aria-label={`${rosterAlt(team)} ${members.length} ตัว`}
      data-testid={`qmon-row-${team}`}
    >
      {members.slice(0, shown).map((m) => (
        <div
          key={m.key}
          className={css.tile}
          style={{ animationDelay: `-${((m.key * 0.37) % BOB_PERIOD_S).toFixed(2)}s` }}
        >
          <QmonTile src={m.src} />
        </div>
      ))}
      {extra > 0 && (
        <div className={css.more} data-testid={`qmon-more-${team}`}>
          <span>+{extra}</span>
        </div>
      )}
    </div>
  );
}

const QmonRow = memo(QmonRowImpl);
export default QmonRow;
