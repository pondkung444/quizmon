import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRaidAccess, getActiveRaidRun, getRaidZonesWithLevels } from "@/lib/raid";
import RaidClient from "@/components/raid/RaidClient";
import RaidLevelSelect from "@/components/raid/RaidLevelSelect";
import RaidZoneSelect from "@/components/raid/RaidZoneSelect";

// จุดตัดสิน resume จุดเดียว (ห้ามให้ /raid/[slug]/page.tsx ตัดสินซ้ำ) — ถ้ามีรันค้างอยู่เรนเดอร์ตรงๆ
// ไม่สนว่าด่าน/โซนไหน ไม่งั้นเลือกโซนเดียว/หลายโซนตาม ?zone= แล้วส่งต่อไปหน้าเลือกด่าน
export default async function RaidPage({
  searchParams,
}: {
  searchParams: Promise<{ pet?: string; zone?: string }>;
}) {
  const supabase = await createClient();
  const user = await requireRaidAccess(supabase);

  const { pet: petParam, zone: zoneParam } = await searchParams;

  const activeView = await getActiveRaidRun(supabase, user.id);
  if (activeView) {
    return <RaidClient view={activeView} />;
  }

  const zones = await getRaidZonesWithLevels(supabase, user.id);
  if (zones.length === 0) redirect("/pet");

  if (zones.length === 1) {
    return <RaidLevelSelect zone={zones[0]} petParam={petParam ?? null} />;
  }

  const selectedZone = zoneParam ? zones.find((z) => z.zoneSlug === zoneParam) : undefined;
  if (!selectedZone) {
    return <RaidZoneSelect zones={zones} />;
  }

  return <RaidLevelSelect zone={selectedZone} petParam={petParam ?? null} />;
}
