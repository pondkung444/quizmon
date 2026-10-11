"use client";
import { useEffect, useState } from "react";
import { hasFarmAttention, type FarmAttention } from "@/lib/farm/attention";
export function useFarmAttention(pathname: string | null) {
  const [dot, setDot] = useState(false);
  useEffect(() => {
    if (
      !pathname ||
      /^\/(login|guardian|admin|guest)(\/|$)/.test(pathname) ||
      pathname === "/"
    )
      return;
    let stopped = false;
    let requestVersion = 0;
    let value: FarmAttention | null = null;
    let received = 0;
    const controller = new AbortController();
    const update = () => {
      if (!stopped && !document.hidden)
        setDot(hasFarmAttention(value, performance.now() - received));
    };
    const refresh = async () => {
      if (document.hidden) return;
      const version = ++requestVersion;
      try {
        const r = await fetch("/api/farm/attention", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!r.ok) return;
        const next = (await r.json()) as FarmAttention | null;
        if (stopped || version !== requestVersion) return;
        value = next;
        received = performance.now();
        update();
      } catch {
        /* Keep last known dot until the next refresh. */
      }
    };
    void refresh();
    const polling = setInterval(() => void refresh(), 60000);
    const ticking = setInterval(update, 1000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(polling);
      clearInterval(ticking);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [pathname]);
  return dot;
}
