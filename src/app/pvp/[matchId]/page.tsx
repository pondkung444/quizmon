import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePvpAccess, getPvpMatchView } from "@/lib/pvp";
import DuelClient from "./DuelClient";
import AppThemeMarker from "@/components/AppThemeMarker";

export const dynamic = "force-dynamic";

export default async function PvpMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const user = await requirePvpAccess();
  const { matchId } = await params;
  const supabase = await createClient();

  const view = await getPvpMatchView(supabase, user.id, matchId);
  if (!view) redirect("/pvp");

  // ธีมแอปครอบสนามประลองด้วย (2026-09 — เดิมตั้งใจเว้นไว้) พื้นสนามไล่สีจาก --duel-arena-top
  return (
    <>
      <AppThemeMarker />
      <DuelClient
        // remount ทุกครั้งที่สถานะ/เฟส/ยก เปลี่ยน — กัน state (timer, การ์ดที่เลือก) ค้างข้ามตา
        key={`${view.matchId}:${view.status}:${view.phase}:${view.currentRound}`}
        view={view}
      />
    </>
  );
}
