import { redirect } from "next/navigation";
import { requirePvpAccess, getChallengeableFriends, getPvpEligiblePets } from "@/lib/pvp";
import NewChallengeClient from "./NewChallengeClient";

export const dynamic = "force-dynamic";

export default async function NewPvpChallengePage() {
  const user = await requirePvpAccess();
  const [friends, pets] = await Promise.all([
    getChallengeableFriends(user.id),
    getPvpEligiblePets(user.id),
  ]);

  // ไม่มี Qmon stage 4 -> กลับหน้าบ้าน (ประลองไม่ได้อยู่ดี)
  if (pets.length === 0) redirect("/pet");

  return <NewChallengeClient friends={friends} pets={pets} />;
}
