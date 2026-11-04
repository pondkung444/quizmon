import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRaidAccess, getActiveRaidRun, getRaidZonesWithLevels, getEligibleRaidPets, getRaidTicketCount, type RaidZoneWithLevels } from "@/lib/raid";
import { raidArenaEnabled } from "@/lib/raid/cards/server";
import { getRaidNoPetInfo } from "@/lib/raid/arena";
import ArenaLevelSelect from "@/components/raid/arena/ArenaLevelSelect";
import ArenaNoPet from "@/components/raid/arena/ArenaNoPet";
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

  // สนามใหม่ (flag เปิด): หน้าเลือกด่านแบบต้นแบบ หรือจอชวนไปฝึกถ้ายังไม่มี Qmon ระยะ 4
  const levelSelect = async (zone: RaidZoneWithLevels) => {
    if (!raidArenaEnabled()) return <RaidLevelSelect zone={zone} petParam={petParam ?? null} />;
    const [pets, keys] = await Promise.all([getEligibleRaidPets(supabase, user.id), getRaidTicketCount(supabase, user.id)]);
    if (pets.length === 0) return <ArenaNoPet pet={await getRaidNoPetInfo(supabase, user.id)} />;
    return <ArenaLevelSelect zone={zone} keys={keys} petParam={petParam ?? null} />;
  };

  if (zones.length === 1) {
    return levelSelect(zones[0]);
  }

  const selectedZone = zoneParam ? zones.find((z) => z.zoneSlug === zoneParam) : undefined;
  if (!selectedZone) {
    return <RaidZoneSelect zones={zones} />;
  }

  return levelSelect(selectedZone);
}
