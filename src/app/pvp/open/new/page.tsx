import { createClient } from "@/lib/supabase/server";
import { requirePvpAccess, getPvpEligiblePets, getPvpTicketBalance, getPvpGearLockedPetIds } from "@/lib/pvp";
import { getUserRaidGearItems } from "@/lib/raid";
import AppThemeMarker from "@/components/AppThemeMarker";
import OpenChallengeClient from "./OpenChallengeClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function NewOpenChallengePage() {
  const user = await requirePvpAccess();
  if (user.isAnonymous) redirect("/pvp");
  const supabase = await createClient();
  const [pets, ticketBalance, gearItems, lockedPetIds, { data: pending }] = await Promise.all([
    getPvpEligiblePets(user.id), getPvpTicketBalance(supabase, user.id),
    getUserRaidGearItems(supabase, user.id), getPvpGearLockedPetIds(user.id),
    supabase.from("pvp_challenges").select("id").eq("challenger_id", user.id)
      .eq("visibility", "open").eq("status", "pending").gt("expires_at", new Date().toISOString()).limit(1),
  ]);
  return <><AppThemeMarker /><OpenChallengeClient pets={pets.filter(p => p.stage === 4)}
    ticketBalance={ticketBalance} gearItems={gearItems} lockedPetIds={lockedPetIds}
    hasPending={Boolean(pending?.length)} /></>;
}
