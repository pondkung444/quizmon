import { createClient } from "@/lib/supabase/server";
import { requirePvpAccess, getPvpOverview } from "@/lib/pvp";
import PvpOverviewClient from "./PvpOverviewClient";
import PvpGuestLocked from "./PvpGuestLocked";
import AppThemeMarker from "@/components/AppThemeMarker";

// ประลองเปิดให้ทุก authenticated user (เมนูล่างมีแท็บ "ประลอง" แล้ว) — gate แค่ auth
export const dynamic = "force-dynamic";

export default async function PvpPage() {
  const user = await requirePvpAccess();
  // ธีมแอปวางทีละหน้า (ไม่ใช่ pvp/layout.tsx) เพราะจอต่อสู้ /pvp/[matchId] ต้องคงโทนเดิม
  if (user.isAnonymous)
    return (
      <>
        <AppThemeMarker />
        <PvpGuestLocked />
      </>
    );
  const supabase = await createClient();
  const overview = await getPvpOverview(supabase, user.id);
  return (
    <>
      <AppThemeMarker />
      <PvpOverviewClient overview={overview} />
    </>
  );
}
