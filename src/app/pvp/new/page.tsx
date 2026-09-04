import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  requirePvpAccess,
  getChallengeableFriends,
  getPvpEligiblePets,
  getPvpTicketBalance,
  getPvpGearLockedPetIds,
} from "@/lib/pvp";
import { getUserRaidGearItems } from "@/lib/raid";
import NewChallengeClient from "./NewChallengeClient";

export const dynamic = "force-dynamic";

export default async function NewPvpChallengePage() {
  const user = await requirePvpAccess();
  const supabase = await createClient();
  const [friends, pets, ticketBalance, gearItems, lockedPetIds] = await Promise.all([
    getChallengeableFriends(user.id),
    getPvpEligiblePets(user.id),
    getPvpTicketBalance(supabase, user.id),
    getUserRaidGearItems(supabase, user.id),
    getPvpGearLockedPetIds(user.id),
  ]);

  // ไม่มี Qmon stage 4 -> กลับหน้าบ้าน (ประลองไม่ได้อยู่ดี)
  if (pets.length === 0) redirect("/pet");

  return (
    <NewChallengeClient
      friends={friends}
      pets={pets}
      ticketBalance={ticketBalance}
      gearItems={gearItems}
      lockedPetIds={lockedPetIds}
    />
  );
}
