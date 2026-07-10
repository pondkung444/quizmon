"use client";

import { useEffect } from "react";
import { track, type AnalyticsProps } from "@/lib/analytics";

// ยิง event ครั้งเดียวตอน mount — ใช้แปะในหน้า server component ที่อยากเก็บ event "เปิดหน้า"
// โดยไม่ต้องแปลงทั้งหน้าเป็น client component
export default function TrackOnMount({
  event,
  props,
  petId = null,
}: {
  event: string;
  props?: AnalyticsProps;
  petId?: string | null;
}) {
  useEffect(() => {
    track(event, props, petId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
