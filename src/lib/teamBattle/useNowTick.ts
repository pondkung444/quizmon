"use client";

import { useEffect, useState } from "react";

/** Date.now() ที่อัปเดตทุก `ms` — ไว้นับถอยหลัง/คุมอายุ overlay (ไม่เรียก Date.now() ใน render) */
export function useNowTick(ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
