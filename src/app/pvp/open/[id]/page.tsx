import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePvpAccess, getPvpOverview, getPvpEligiblePets, getPvpGearLockedPetIds } from "@/lib/pvp";
import { getUserRaidGearItems } from "@/lib/raid";
import AppThemeMarker from "@/components/AppThemeMarker";
import AcceptOpenChallengeClient from "./AcceptOpenChallengeClient";

export const dynamic = "force-dynamic";
export default async function AcceptOpenChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePvpAccess();
  if (user.isAnonymous) redirect("/pvp");
  const { id } = await params;
  const supabase = await createClient();
  const [overview, pets, gearItems, lockedPetIds] = await Promise.all([
    getPvpOverview(supabase, user.id), getPvpEligiblePets(user.id),
    getUserRaidGearItems(supabase, user.id), getPvpGearLockedPetIds(user.id),
  ]);
  const challenge = overview.openChallenges.find(c => c.id === id);
  if (!challenge) redirect("/pvp");
  return <><AppThemeMarker /><AcceptOpenChallengeClient challenge={challenge}
    pets={pets.filter(p => p.stage === 4)} gearItems={gearItems}
    lockedPetIds={lockedPetIds} ticketBalance={overview.ticketBalance} /></>;
}
