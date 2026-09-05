import { createClient } from "@/lib/supabase/server";
import { requirePvpAccess, getPvpOverview } from "@/lib/pvp";
import PvpOverviewClient from "./PvpOverviewClient";

// ประลองเปิดให้ทุก authenticated user (เมนูล่างมีแท็บ "ประลอง" แล้ว) — gate แค่ auth
export const dynamic = "force-dynamic";

export default async function PvpPage() {
  const user = await requirePvpAccess();
  const supabase = await createClient();
  const overview = await getPvpOverview(supabase, user.id);
  return <PvpOverviewClient overview={overview} />;
}
