import { notFound } from "next/navigation";
import { isBattlePreviewEnabled, parsePreviewParams } from "@/lib/teamBattle/previewFixtures";
import BattlePreviewClient from "./BattlePreviewClient";

// Team Battle — preview จอกลางด้วยข้อมูลจำลอง (dev เท่านั้น; ไม่ต้องล็อกอิน ไม่แตะ DB)
// ใช้ flag เดียวกับ /raid/preview (RAID_CARD_PREVIEW=true); path นี้ขึ้นต้น /teacher/<x>/battle จึงได้ BGM silent อยู่แล้ว
export default async function BattlePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isBattlePreviewEnabled(process.env.NODE_ENV, process.env.RAID_CARD_PREVIEW)) notFound();
  const sp = await searchParams;
  const bare = sp.bare === "1";
  const play = sp.play === "1";
  return <BattlePreviewClient params={parsePreviewParams(sp)} bare={bare} play={play} />;
}
