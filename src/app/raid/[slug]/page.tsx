import { cardRaidsEnabled, raidArenaEnabled } from "@/lib/raid/cards/server";
import { loadRaidChapters } from "@/lib/raid/arena";
import ArenaPrep from "@/components/raid/arena/ArenaPrep";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requireRaidAccess,
  getActiveRaidRun,
  getRaidTypeBySlug,
  getRaidZonesWithLevels,
  getEligibleRaidPets,
  getRaidTicketCount,
  getUserRaidGearItems,
} from "@/lib/raid";
import RaidClient from "@/components/raid/RaidClient";

export default async function RaidLevelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pet?: string }>;
}) {
  const supabase = await createClient();
  const user = await requireRaidAccess(supabase);

  const { slug } = await params;
  const { pet: petParam } = await searchParams;

  // /raid เป็นจุดเดียวที่ตัดสิน resume — มีรันค้างอยู่แล้วให้เด้งไปที่นั่นแทนตัดสินซ้ำที่นี่
  const activeView = await getActiveRaidRun(supabase, user.id);
  if (activeView) redirect("/raid");

  const raidType = await getRaidTypeBySlug(supabase, slug);
  if (!raidType) redirect("/raid");

  // unlock gate — กันเดา URL ข้ามด่าน (ซ่อนปุ่มอย่างเดียวไม่พอ)
  const zones = await getRaidZonesWithLevels(supabase, user.id);
  const level = zones.flatMap((z) => z.levels).find((l) => l.slug === slug);
  if (!level || !level.unlocked) redirect("/raid");

  const [pets, ticketCount, gearItems] = await Promise.all([
    getEligibleRaidPets(supabase, user.id),
    getRaidTicketCount(supabase, user.id),
    getUserRaidGearItems(supabase, user.id),
  ]);

  const preselectedPetId = petParam && pets.some((p) => p.id === petParam) ? petParam : null;

  if (raidArenaEnabled()) {
    // ยังไม่มี Qmon ระยะ 4 → /raid แสดงจอชวนไปฝึกแทน
    if (pets.length === 0) redirect("/raid");
    const zoneLevels = zones.find((z) => z.levels.some((l) => l.slug === slug))?.levels ?? [];
    return (
      <ArenaPrep
        raidType={raidType}
        tier={Math.max(0, zoneLevels.findIndex((l) => l.slug === slug))}
        pets={pets}
        ticketCount={ticketCount}
        preselectedPetId={preselectedPetId}
        gearItems={gearItems}
        chapters={await loadRaidChapters(supabase)}
      />
    );
  }

  return (
    <RaidClient
      view={{ phase: "predeparture", cardMode: cardRaidsEnabled(), raidType, pets, ticketCount, preselectedPetId, gearItems }}
    />
  );
}
