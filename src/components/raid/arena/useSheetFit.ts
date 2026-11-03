"use client";

import { useEffect, useRef } from "react";

const TUCK_UNDER_SHEET = 24;

// Portrait phones: the arena takes what is left above the sheet, tucked under its rounded edge.
// Side-by-side layouts pin the sheet in the right panel, so they report nothing.
export default function useSheetFit(onFit: (height: number | null) => void, minArena = 150) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sheet = ref.current;
    if (!sheet) return;
    const measure = () => {
      const sideBySide = window.matchMedia("(orientation:landscape) and (max-height:540px), (min-width:1024px) and (min-height:541px)").matches;
      onFit(sideBySide ? null : Math.max(minArena, window.innerHeight - sheet.offsetHeight + TUCK_UNDER_SHEET));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [onFit, minArena]);
  return ref;
}
