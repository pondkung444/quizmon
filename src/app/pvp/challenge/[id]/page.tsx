import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requirePvpAccess,
  getPvpChallengeForAccept,
  getPvpEligiblePets,
  getPvpGearLockedPetIds,
} from "@/lib/pvp";
import { getUserRaidGearItems } from "@/lib/raid";
import AcceptChallengeClient from "./AcceptChallengeClient";
import AppThemeMarker from "@/components/AppThemeMarker";

export const dynamic = "force-dynamic";

export default async function AcceptPvpChallengePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePvpAccess();
  const { id } = await params;
  const supabase = await createClient();

  const challenge = await getPvpChallengeForAccept(supabase, user.id, id);
  if (!challenge) redirect("/pvp");
  if (challenge.status !== "pending") redirect("/pvp");

  const [pets, gearItems, lockedPetIds] = await Promise.all([
    getPvpEligiblePets(user.id),
    getUserRaidGearItems(supabase, user.id),
    getPvpGearLockedPetIds(user.id),
  ]);
  if (pets.length === 0) redirect("/pet");

  // ธีมแอป (dusk/day) — ดู components/AppThemeMarker.tsx
  return (
    <>
      <AppThemeMarker />
      <AcceptChallengeClient
        challenge={challenge}
        pets={pets}
        gearItems={gearItems}
        lockedPetIds={lockedPetIds}
      />
    </>
  );
}
