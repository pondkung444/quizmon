import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  getActiveDungeon,
  getEligiblePets,
  getOwnActiveRun,
  getPityMeter,
} from "@/lib/dungeon";
import AdventureClient, { type AdventureView } from "@/components/dungeon/AdventureClient";

export default async function AdventurePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const activeRun = await getOwnActiveRun(supabase, user.id);

  let view: AdventureView;

  if (activeRun) {
    const pityMeter = await getPityMeter(supabase, user.id, activeRun.dungeon.rewardTier);
    const isClaimable = new Date(activeRun.run.endsAt).getTime() <= Date.now();
    view = {
      kind: isClaimable ? "claimable" : "traveling",
      dungeon: activeRun.dungeon,
      run: activeRun.run,
      pityMeter,
    };
  } else {
    const eligiblePets = await getEligiblePets(supabase, user.id);
    // ไม่มีรันค้าง และไม่มี Qmon ที่ส่งได้เลย — ไม่ควรเข้าถึงจอนี้ได้ตั้งแต่แรก (การ์ดหน้าแรกไม่มีลิงก์
    // มาที่นี่ในสถานะนี้) เผื่อ direct URL ให้เด้งกลับ /pet เงียบๆ
    if (eligiblePets.length === 0) redirect("/pet");

    const dungeon = await getActiveDungeon(supabase);
    if (!dungeon) redirect("/pet");

    const pityMeter = await getPityMeter(supabase, user.id, dungeon.rewardTier);
    view = { kind: "predeparture", dungeon, pets: eligiblePets, pityMeter };
  }

  return <AdventureClient view={view} />;
}
